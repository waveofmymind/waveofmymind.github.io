---
title: "쿠버네티스 배포 전략 - Deployment"
date: 2023-06-21 23:27:00 +0900
aliases: 
tags: [Kubernetes,k8s,Deployment]
categories: [DevOps]
---

![Kubernetes](/assets/img/kubernetes.webp)


쿠버네티스 오브젝트 Deployment에 대한 배포 전략과 설정에 대해 학습한 것을 공유하는 글입니다.

## ReplicaSet을 이용한 배포 전략

ReplicaSet을 사용하면 Pod을 하나씩 apply 하지 않아도 설정해둔 템플릿의 이미지를 통해 Pod을 배포 및 관리를 시킬 수 있다.

설정해둔 Replicas의 수 만큼 관리하기 때문에 하나가 정지해도 다시 실행을 보장해주는 기능은 매우 유용하다.

그러나, 만약 현재 배포된 버전이 문제가 발생해서 이전 버전으로 다운그레이드 해야하는 상황이 생기면 아래와 같은 순서로 이전 버전으로 다운그레이드 시켜야한다.

만약 문제가 발생한 버전이 2.0인데, 1.0으로 다운그레이드 해야할 경우

- ReplicaSet의 템플릿 정보 중, image를 1.0 버전으로 낮춘다.
- 그러나 ReplicaSet에 의해 관리되는 Pod(2.0버전)이 이미 Replicas의 수만큼 실행중이므로 ReplicaSet의 이미지를 변경해도 반영되지 않는다.(1.0 버전이 실행되지 않는다.)

그렇다면 실행중인 Pod(2.0버전)을 삭제한다?

그러나 우리는 문제가 터진 버전에 대해 디버그를 해야한다.

- 실행중인 Pod(2.0버전)의 라벨을 변경한다.
- 변경하게 되면 ReplicaSet에서 설정한 matchLabel이 아니기 때문에 ReplicaSet의 관리에서 벗어난다. 즉, ReplicaSet의 관점에서 관리해야 하는 Pod이 0이 되어서 Replicas의 수 만큼 실행시킨다.(이떄 1.0버전으로 실행)
- 이제 실행중인 Pod은 모두 6개가 되어 디버그를 실행하거나 이전 버전으로 사용자에게 무중단으로 서비스를 제공할 수 있다.

그러나 위 과정을 우리가 반복해야하는 것은 k8s를 사용하는 장점이 퇴색된다.

그렇다면 어떻게 해야할까?

## Deployment

쿠버네티스의 오브젝트 중 Deployment를 사용할 수 있다.

새로운 ReplicaSet의 생성 및 Pod의 재배포, 그리고 필요 없는 ReplicaSet과 Pod을 제거할 수 있다.

우선 Pod 배포를 위한 필수 정보는 세가지이다.

1. selector: 어떤 Pod 집합을 ReplicaSet으로 관리할 것인가?
2. replicas: 얼마나 Pod를 생성할 것인가?
3. Pod template image: Pod에서 어떤 컨테이너를 실행할 것인가?

즉, 우리가 원하는 책임은

![deployment](/assets/img/2023-06-21-k8s-deployment/deployment1.webp)

**Pod Template의 이미지가 바뀔 때마다 쿠버네티스가 알아서 ReplicaSet을 생성하고 이전 Pod을 제거해주는 것** 이라고 할 수 있다.

그래서 Deployment의 존재 의의는 Pod의 배포 자동화이다.(ReplicaSet + 배포 전략)

- 새로운 Pod을 롤아웃/롤백할 때 ReplicaSet을 생성해준다.
- 다양한 배포 전략을 제공하며, 이전 파드에서 새로운 파드로의 전환 속도도 제어할 수 있다.

## 생성 방법

```yaml
apiVersion: apps/v1 # Kubenetes API 버전
kind: Deployment # 오브젝트 타입
metadata:	# 오브젝트를 유일하게 식별하기 위한 정보
  name: my-app	# 오브젝트 이름
spec:	# 사용자가 원하는 Pod의 바람직한 형태
  selector:    # ReplicaSet을 통해 관리할 Pod를 선택하기 위한 Label Query(K-V)
    matchLabels:
      app: my-app
  replicas: 3	# 실행하고자 하는 Pod 복제본 개수 
  template:     # Pod 실행 정보 - Pod Template와 동일(metadata, spec, ...)
    metadata:
      labels:
    	app: my-app #selector에 정의한 label이 있어야 ReplicaSet에 의해 관리된다.
    spec:
      containers:
      - name: my-app
      image: my-app:1.0

```

위처럼 오브젝트 파일을 정의하고 apply하면 하나의 ReplicaSet, 3개의 Pod(1.0)가 배포된다.

만약 위에서 3개의 Pod에 대해 image를 변경 요청할 경우 아래와 같이 새로운 ReplicaSet과 Pod(2.0)가 생성된다.

![deployment](/assets/img/2023-06-21-k8s-deployment/deployment2.webp)

그 후, 이전 ReplicaSet에 대해 스케일을 0으로 설정하기 때문에 이전 버전의 Pod(1.0)는 모두 종료된다.

이를 어떻게 할 것인가에 대해서는 배포 전략을 구분한다.

### Recreate

재생성한다는 의미로, 이전 Pod을 모두 종료하고 새로운 Pod을 replicas만큼 생성한다.

![deployment](/assets/img/2023-06-21-k8s-deployment/recreate.webp)

즉, 모든 Pod이 종료되는 시점이 반드시 존재하며 그 동안에는 서비스를 이용할 수 없는 **다운타임**이 존재하게 된다.

![deployment](/assets/img/2023-06-21-k8s-deployment/recreate2.webp)

운영 단계에서는 적합하지 않다.

### RollingUpdate

점진적 배포 방법으로, 새로운 Pod 생성과 이전 Pod 종료가 동시에 일어난다.

![deployment](/assets/img/2023-06-21-k8s-deployment/rollingUpdate.webp)

하나가 제거되면 하나가 생성되는 점진적인 방식으로 Pod를 교체한다.

![deployment](/assets/img/2023-06-21-k8s-deployment/rollingUpdate2.webp)


다운 타임이 존재하지 않지만, 두 버전의 Pod이 존재하는 시점에서 요청에 따라 응답이 다를 수 있다.

이때 전환되는 Pod의 규모를 정하는 속도 제어 옵션은 다음과 같다.

- maxUnavaliable: 배포를 하는 동안 유지하고자 하는 최소 Pod의 개수를 정하는 전략
- maxSurge: 새로운 Pod을 한 시점에 최대 몇개까지 생성할 수 있게 하는지를 정하는 전략

### Revision

pod-template-hash를 통해 Deployment는 롤아웃 히스토리를 관리한다.

이를 사용하면 롤백을 손쉽게 할 수 있다.

```
$ kubectl rollout undo deployment <deployment-name> --to-revision=1
```



## 레퍼런스

- [디플로이먼트 - Kubenetes 공식 문서](https://kubernetes.io/ko/docs/concepts/workloads/controllers/deployment/)

- [How Rolling and Rollback Deployments work in Kubernetes](https://yankeexe.medium.com/how-rolling-and-rollback-deployments-work-in-kubernetes-8db4c4dce599)
