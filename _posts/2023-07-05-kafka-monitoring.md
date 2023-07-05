---
title: "카프카 모니터링"
date: 2023-07-05 09:29:00 +0900
aliases: 
tags: [Kafka,Kafka-UI]
categories: [Kafka]
---

지난번에 굿잡 프로젝트에서 사용할 카프카를 서버에 구축했습니다.

현재, 카프카 브로커를 3대로 사용하고, 주키퍼 없이 KRaft 모드로 실행하기 때문에 컨트롤러 역할을 하는 서버가 필요한데, 저는 서버 3대를 모두 카프카 브로커이자 컨트롤러 역할을 하도록 실행시켰습니다.

그리고 저는 스프링 부트 프로젝트에서 스프링 카프카를 사용해서 메시지를 프로듀싱 및 컨슘을 하기 때문에

직접적으로 해당 토픽에 대해서 잘 갔는지 로그를 통해 확인했습니다.

이러한 점은 예전에 클라우드 워치를 적용하던 이유와 비슷하게 불편함을 초래했습니다.

우선 클라우드 워치를 통해 로그를 확인할 수 있기 때문에 직접 쿠버네티스에 접속해서 kubectl 명령어로 확인을 하지 않아도 됬지만,

카프카만을 위해 사용하는 서비스가 아니기 때문에, 다른 특정 시간에 발행한 메시지를 확인하기 위해 수많은 로그들을 파헤치고 이전 이벤트를 확인하는 등의 번거로움이 새로 발생했습니다.

그래서 저는 카프카만을 위한 모니터링 시스템을 구축하는 좋겠다는 생각이 들어 찾아보게 되었습니다.

## Kafka UI 툴

카프카를 모니터링하기 위해서는 다양한 모니터링 툴이 존재하는데요.

![many tools](/assets/img/2023-07-05-kafka-monitoring/many-tools.webp)

저희는 그 중 UI for Apache Kafka라는 툴을 사용해볼 것입니다.

오픈 소스이기 때문에 비용이 무료이며, 모니터링 툴 치고 굉장히 이쁩니다.

특징은 레퍼런스 탭의 깃허브가 있으니, 리드미를 참조하시면 될 것 같습니다.

### 설치

저는 공식 깃허브에서 안내하는 도커 컴포즈로 설치를 해볼 것입니다.

```yaml
version: '2'
services:
  kafka-ui:
    image: provectuslabs/kafka-ui
    container_name: kafka-ui
    ports:
      - "8989:8080"
    restart: always
    environment:
      - KAFKA_CLUSTERS_0_NAME=my-cluster
      - KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS=브로커1:9092,브로커2:9094,브로커3:9096
```

저는 위와 같이 작성했는데, 주키퍼를 사용하지 않았기 때문에 주키퍼용 포트는 따로 설정하지 않았습니다.

만약 주키퍼를 사용한다면, 환경변수로
```
- KAFKA_CLUSTERS_0_ZOOKEEPER=zookeeper-1:22181
```
라는 옵션이 있으니 참고하시면 될 것 같습니다.

이제 실행해줍시다.

```
docker-compose up -d
```

저는 위에서 도커를 통해 8989포트로 접근할 수 있도록 포트를 설정했기 때문에

http://localhost:8989로 접속해야합니다.

![first page](/assets/img/2023-07-05-kafka-monitoring/first-page.webp)

접속하면 위와 같이 제가 사전에 정의해놓은 클러스터 이름과 함께 정보들이 나오고 있습니다.

그리고 좌측에는 브로커, 토픽, 컨슈머 ACL등 다양한 탭이 있는데요.

하나씩 들어가보면,

우선 브로커 페이지에 접속하면 다양한 정보들이 있습니다.

![broker page](/assets/img/2023-07-05-kafka-monitoring/broker-page.webp)

그리고, 제가 개인적으로 굉장히 맘에 들었던 토픽 페이지인데요.

![topic page](/assets/img/2023-07-05-kafka-monitoring/topic-page.webp)

토픽 별로 확인할 수 있으며, 오른쪽 상단의 `Add a Topic`을 통해 토픽을 새로 생성할 수도 있고,

특정 토픽의 상세 페이지에서 메시지를 발행하는 것도 가능합니다.

![produce page](/assets/img/2023-07-05-kafka-monitoring/produce.webp)

위와 같이 키를 따로 정해서 보내는 것도 지원하고 있으며, Produce Message를 누르면

![result page](/assets/img/2023-07-05-kafka-monitoring/result.webp)

위와 같이 메시지가 정상적으로 보내온 것을 확인할 수 있습니다!

저는 테스트를 할 때 리눅스 서버에 접속해서 sh 파일로 메시지를 발행, 구독을 했기 떄문에 명령어를 따로 알아야할 필요가 있었지만, Kafka UI를 사용해서 손쉽게 테스트를 할 수 있었습니다.

## 정리

스프링 부트 서버를 프로메테우스 + 그라파나를 통해 모니터링 환경을 구축하고, 실제로 트러블 슈팅을 모니터링을 통해 해결하면서 모니터링 환경을 구축하는 것이 중요한 일임을 알게 되었습니다.

카프카를 설치하면서도 테스트를 할 때 콘솔 창을 두개 띄워서 발행/구독하며 테스트를 하는 것이 번거로웠고,

스케줄링 서비스가 메시지 큐에 잘 보내고 있는지 확인할 필요가 있어서 카프카 모니터링 툴을 찾아보게 되었습니다.

실제로 적용하고 나서 클라우드 워치를 확인하여 발행이 잘 되는지, 구독을 잘 하고 있는지 확인할 필요가 없어졌고, 어떤 토픽에 문제가 있으면 특정 서비스만을 확인할 수 있었습니다.














## 레퍼런스

- [kafka-ui 깃허브](https://github.com/provectus/kafka-ui)

- [Kafka-UI Tool 을 이용하여 Kafka 관리하기](https://devocean.sk.com/blog/techBoardDetail.do?ID=163980)


