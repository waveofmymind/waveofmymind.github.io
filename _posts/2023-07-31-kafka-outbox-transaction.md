---
title: "서비스 원자성 보장하기 - 카프카 트랜잭션 아웃 박스 패턴"
date: 2023-07-31 09:29:00 +0900
aliases: 
tags: [Transaction,Kakfa,MQTT,Atomicity]
categories: [Trouble Shooting]
---

저희 굿잡에서는 사용자의 이력서를 기반으로 한 생성 AI 서비스, 면접 예상 질문과 이력서 검토 서비스를 제공하고 있습니다.

이를 위한 사용자 요청으로부터의 플로우 차트는 아래와 같습니다.

![flow](/assets/img/2023-07-31-kafka-transaction-outbox/flow.web)

기존의 위 과정에서 문제점을 발견하고 어떻게 해결하게 되었는지를 공유하고자 합니다.

## AS-IS

기존의 플로우 차트에서의 메시지 처리 과정은 다음과 같습니다.

1. 검증을 통과하면 해당 요청 객체(사용자 이력서)를 카프카 메시지로 발행한다.

2. 컨슈머에서 이를 받아 외부 API를 호출, 성공적으로 응답이 오면 DB에 저장한다.

그러나 이는 두가지 문제가 있는데요.

1. 외부 API 호출에 대한 보상 로직은 코인 복구를 통해 되어있지만 메시지 발행을 반드시 보장하지 못한다는 점

2. 챗 GPT 답변 생성이 실패했을 때 사용자가 요청했던 내용이 휘발성이기 때문에 디버깅을 할 수 없다.

위 두가지 쟁점은 처음 구현할 때는 지나쳤지만, 사용성을 생각했을 때 큰 영향을 미칠 수 있다고 판단했습니다.

우선 1번으로 야기되는 문제점으로는,

현재 사용자가 제출하면 제출이 완료되었다는 페이지를 안내받으면, 사용자가 별도의 서비스를 이용할 수 있습니다.

그리고 뒷단에서는 서버에서 토픽으로 사용자 요청 정보를 메시지로 발행하고 해당 메시지를 컨슘해서 처리하게 되는데요.

만약 메시지가 브로커로 제대로 전달되지 않았을 경우에는 사용자는 자신의 정보가 제대로 갔는지 확인할 수 있는 방법이 없습니다.

그리고 2번으로 야기되는 문제점은,

저희는 프롬프트를 통해 챗 GPT에게 정해진 응답을 요청하는 서비스로 되어있는데, 챗 GPT의 답변이 완전히 저희가 원하는 JSON 형태로 오지 않을 때가 종종 있었습니다.

이럴 때는 사용자 요청 정보를 보고 어떤 점이 문제였는지 디버깅을 통해 프롬프트를 수정해야 했기 때문에 사용자 요청 정보를 DB에 저장할 필요성을 느끼게 되었던 것입니다.

그래서 저는 카프카 트랜잭션에 대해서 접하게 되었습니다.

## 카프카에서 트랜잭션을 보장하는 방법

![kt](/assets/img/2023-07-31-kafka-transaction-outbox/kt.webp)

카프카에서 메시지 발행 -> 컨슘 후 커밋 과정을 원자성을 보장하는 방법으로 카프카에서는 트랜잭션을 지원하고 있습니다.

exactly once 세멘틱을 설정하기 위한 몇몇 옵션들이 필요합니다.

우선 이벤트에 대한 트랜잭션을 구분하기 위해서 TRANSACTIONAL_ID_CONFIG가 필요합니다.

이때 랜덤이며, 구분 가능하기 위해 UUID로 설정했습니다.

```kotlin
producerProps.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, UUID.randomUUID().toString());
```

그리고 두번째로는

ENABLE_IDEMPOTENCE_CONFIG인데, 이는 true로 해야합니다.

프로듀서가 메시지를 발행하고 브로커에 들어갈 때 실패 응답을 받았다면, 프로듀서는 같은 메시지를 재발행하게 됩니다.

프로듀서 입장에서는 브로커에 메시지가 들어갔는지, 안들어갔는지 확인할 방법이 없기 때문입니다.

그러나 컨슈머 입장에서는 같은 메시지를 두번이나 받았기 때문에 일관성을 유지할 수 없게됩니다.

이 때 ENABLE_IDEMPOTENCE_CONFIG가 true이면 재발행 된 두번째 메시지와 첫번째 메시지를 PID를 기반으로 비교해서 두번째 메시지를 버립니다.

```kotlin
producerProps.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, "true")
```

이제 컨슈머에서 필요한 옵션들을 살펴보면,

우선 오토 커밋을 false로 해야합니다.
오토 커밋의 경우 메시지를 컨슘한 후, 로직 처리중 에러가 발생해도 커밋을 하기 때문에

이 경우에는 같은 메시지를 다시 컨슘해야할 필요가 있지만, 커밋이 되어있기 때문에 다음 오프셋을 기준으로 메시지를 컨슘합니다.

즉, 메시지 유실이 발생합니다.
그렇기 때문에 커밋을 직접 제어하는 것이 좋습니다.

그리고 마지막으로 ISOLATION_LEVEL_CONFIG입니다.

read_committed로 설정하면 프로듀서가 브로커에게 보낸 메시지 중 트랜잭션이 완료된(커밋된) 데이터에 대해서만 읽을 수 있도록 합니다.

만약 read_committed가 아닐 경우 메시지를 보냈지만 커밋이 실패했을 때 컨슈머가 메시지를 읽게됩니다.

```kotlin
consumerProps.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false)
consumerProps.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed")
```

위와 같은 방법으로 카프카에서는 발행과 컨슘, 그리고 커밋까지의 일관성을 보장하고 있는데요.

이러한 점으로 1번 문제점은 해결할 수 있지만,

2번 문제는 해결할 수 없습니다.

2번 로직을 포함하게 되면

1. 요청 정보를 DB에 저장한다.
2. 해당 정보를 메시지로 발행한다.
3. 메시지를 받아 처리한다.

위 과정에서 1번과 2번 사이의 일관성을 보장하지 못하게 됩니다.

그래서 위 exactly once 세마틱스를 적용하고 아웃박스 트랜잭션 패턴을 적용하게 되었습니다.

## 아웃박스 트랜잭션



## 레퍼런스

-[프로듀서의 전송 방법](https://ojt90902.tistory.com/1185)

-[https://microservices.io/patterns/data/transactional-outbox.html](https://microservices.io/patterns/data/transactional-outbox.html)

-[https://blog.gangnamunni.com/post/transactional-outbox/?fbclid=IwAR0xbxBfnusipaPg7gzhw1-Dz-w0SF0NotG0fKG7SUye8Mg6_68AdsHrq4E](https://blog.gangnamunni.com/post/transactional-outbox/?fbclid=IwAR0xbxBfnusipaPg7gzhw1-Dz-w0SF0NotG0fKG7SUye8Mg6_68AdsHrq4E)


