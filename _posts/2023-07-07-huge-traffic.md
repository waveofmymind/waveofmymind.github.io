---
title: "우아한 쿠버네티스 트래픽 대응기"
date: 2023-05-18 9:29:00 +0900
aliases: 
tags: [Kubernetes]
categories: [DevOps]
---

![logo](/assets/img/2023-07-07-huge-traffic/logo.webp)

사이드 프로젝트를 하면서 대규모 트래픽을 경험하는 일은 없었는데요.

제가 쿠버네티스를 학습하면서, 그리고 프로젝트에 적용했던 대규모 트래픽 대응 방법에 대해서 공유하고자합니다.

굿잡 프로젝트의 시스템 아키텍처는 아래와 같습니다.

![sa](/assets/img/2023-07-07-huge-traffic/sa.webp)

또한 인그레스 - 서비스 - (디플로이먼트) - 파드로 이루어진 쿠버네티스 아키텍처 구조이기 때문에

사용자의 요청을 인그레스가 받아 노드 포트로 열어둔 80포트로 요청이 전달되도록 구성되어있습니다.

디플로이먼트 설정으로 레플리카셋은 4개로 해놓았기 떄문에, 디폴트 옵션인 라운드 로빈 방식으로 서비스단에서 로드밸런싱이 수행되고 있습니다.

## 롤링 업데이트

또한 새로운 버전으로 배포시에는 업데이트 하는 과정에서도 서비스가 중단되지 않게 무중단 배포를 구성했는데요.

디플로이먼트 배포 전략으로 `RollingUpdate`로 설정했습니다. 그리고 세부 옵션은 아래와 같습니다.

- 50% max unavaliable
- 25% max surge

위 옵션으로 제 파드의 롤링 업데이트 과정을 정리하면

1. 4개의 기존 버전의 파드가 실행중
2. max surge가 25%이므로, 4개의 25%, 즉 1개의 새로운 버전의 파드가 실행
3. max unavaliable가 50%이기 때문에 동시에 2개의 기존버전 파드가 종료
4. 다시 2번부터 수행

가 되며, 업데이트시 최소 2개는 실행중이기 때문에 무중단 배포가 이루어지게 됩니다.

## 헬스 체크

그리고 굿잡 프로젝트는 스프링 액추에이터를 사용중이기 때문에, readinessProbe, livenessProbe를 사용해서 컨테이너 상태를 확인하도록 했습니다.

```yaml
readinessProbe:
    httpGet:
        path: /actuator/health/readiness
        port: 8080
    initialDelaySeconds: 30
    periodSeconds: 20
livenessProbe:
    httpGet:
        path: /actuator/health/liveness
        port: 8080
    initialDelaySeconds: 30
    periodSeconds: 20
```

`readinessProbe`를 통해 서버가 정상적으로 준비되었는지를 확인하고, `livenessProbe`로 현재 정상적으로 파드가 실행중인지를 확인합니다.

위 설정을 통해 애플리케이션이 데드락에 빠지거나 다른 이유로 반응이 없을 때 유용하며, 이를 통해 애플리케이션을 자동으로 복구할 수 있도록 했습니다.

## Istio를 활용한 서킷 브레이킹

그리고 마지막으로, 장애 전파를 막기 위한 서킷 브레이커 패턴을 적용하기 위해 Istio 서비스 메쉬를 사용하게 되었습니다.

![is](/assets/img/2023-07-07-huge-traffic/is.webp)

Istio 서비스 메쉬는 말 그대로 서비스 망으로써 각 서비스에 대한 모니터링, 그리고 부하분산, 헬스 체크를 통한 서킷 브레이커를 프록시 패턴으로 구현하고 있습니다.

또한 Istio Ingress Gateway를 사용하면 L7 계층에서 부하분산이 가능해집니다.

즉 게이트웨이를 사용한 아키텍처는 아래와 같아집니다.

![istio](/assets/img/2023-07-07-huge-traffic/istio.webp)

## 테스트

이제 Istio를 설치하고 정상적으로 서킷 브레이커가 발동하는지 테스트해봅시다.

설치하는 과정은 공식 홈페이지에도 잘 나와있기 때문에 생략하겠습니다.

저는 DestinationRule을 다음과 같이 정의했습니다.

```yaml
istio:
  enabled: true
  gateways:
    - "goodjob-gateway"
    - "mesh"
   hosts: waveofmymind.shop
   headers:
     ukids-user:
       exact: green
   trafficPolicy:
     outlierDetection:
       interval: 10s
       consecutive5xxErrors: 3
       baseEjectionTime: 30s
       maxEjectionPercent: 100
```
위 설정을 정리하면

10초동안 연속으로 3개의 5xx 에러를 받을 경우, 30초동안 해당 파드를 pool로부터 분리하게 됩니다.

테스트를 해보기 위해 curl을 통해 요청을 보내봅니다.

저는 2개의 서버를 띄워놓았으며, test 경로로 요청시, 랜덤하게 에러를 반환합니다.

그리고 로드밸런싱 대상 서버를 각각 굿잡 v1, v2라고 하겠습니다.

```sh
for i in {1..10}; do kubectl exec -it goodjob -c goodjob -- curl https://waveofmymind.shop/test; sleep 0.1; done

굿잡 v2 요청입니다.
굿잡 v1 요청입니다.
굿잡 v1 요청입니다.
굿잡 v2 요청입니다.
굿잡 v2 요청입니다.
굿잡 v1 요청입니다.
굿잡 v1 요청입니다.
굿잡 v2 요청입니다.
굿잡 v2 요청입니다.
굿잡 v1 요청입니다.
```

에러가 발생하진 않았습니다.
그러나 로그를 한번 찍어볼까요?

```sh
$ kubectl logs goodjob-v2 -c goobjob-v2

goodjob - v2 - 200
goodjob - v2 - 500
goodjob - v2 - 200
goodjob - v2 - 200
goodjob - v2 - 500
goodjob - v2 - 200
goodjob - v2 - 200

```
500 요청이 두번 발생했기 때문에, 제가 설정한 대로 3번이 아니기 때문에 정상적으로 v2 요청이 9번째에 발생했습니다.

만약 다시 에러를 반환시키면 어떻게 될까요?

```sh
for i in {1..10}; do kubectl exec -it goodjob -c goodjob -- curl https://waveofmymind.shop/test; sleep 0.1; done

굿잡 v1 요청입니다.
굿잡 v2 요청입니다.
굿잡 v1 요청입니다.
굿잡 v1 요청입니다.
굿잡 v1 요청입니다.
굿잡 v1 요청입니다.
굿잡 v1 요청입니다.
굿잡 v1 요청입니다.
굿잡 v1 요청입니다.
굿잡 v1 요청입니다.
```
v2 서버 요청은 1번만 갔으며, 그 다음부터는 모두 v1 요청으로 로드밸런싱이 되었습니다.

```sh
$ kubectl logs goodjob-v2 -c goobjob-v2

goodjob - v2 - 200
goodjob - v2 - 500
goodjob - v2 - 200
goodjob - v2 - 200
goodjob - v2 - 500
goodjob - v2 - 200
goodjob - v2 - 200
goodjob - v2 - 200
goodjob - v2 - 500
```

위에서 2번의 요청이 에러를 반환했고, 추가 요청에서 1번의 500 에러가 발생했기 때문에 
그 이후로는 goodjob v2 서버에 대한 요청은 오지 않고 모두 v1로 분산이 되었습니다.

30초 내로 3번의 요청이 실패했기 때문에 Pool로부터 Ejection을 당했기 때문입니다.

이렇게 서킷 브레이커 발동을 확인할 수 있었습니다.

## 회고

프로젝트를 진행하면서 Docker 서버에서 실행했던 프로젝트가 수많은 OOM 끝에 쿠버네티스 환경에서

Service를 LoadBalancer으로 실행하여 사용한 L4 부하분산부터,

Nginx-Ingress-Controller까지 적용해보고, 최종적으로는 Istio-Ingress-Gateway까지 적용하게 되었습니다.

이러한 설정으로는 대규모 트래픽을 감당할 수 있을지는 테스트를 해봐야 알 수 있겠지만,

어떤 과정으로 많아지는 트래픽을 감당할 수 있을까에 대해 알아볼 수 있는 좋은 경험이였습니다.

## 레퍼런스

- [istio.io](https://istio.io/)

- [Istio: Circuit Breaker를 지원하는 Service Mesh의 구현체](https://ooeunz.tistory.com/141)

- [istio https redirect 설정 상태에서 certmanager 인증서 발급법](https://lcc3108.github.io/articles/2021-04/istio-https-redirect-certmanager-renew)










