---
title: "서비스 원자성 보장하기 - 카프카 트랜잭션 아웃 박스 패턴"
date: 2023-07-30 09:29:00 +0900
aliases: 
tags: [Transaction,Kakfa,MQTT,Atomicity]
categories: [Trouble Shooting]
---

저희 굿잡에서는 사용자의 이력서를 기반으로 한 생성 AI 서비스, 면접 예상 질문과 이력서 검토 서비스를 제공하고 있습니다.

이를 위한 사용자 요청으로부터의 플로우 차트는 아래와 같습니다.

![flow](/assets/img/2023-07-30-kafka-transaction-outbox/flow.webp)

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

![kt](/assets/img/2023-07-30-kafka-transaction-outbox/kt.webp)

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

그래서 저는 exactly once 세멘틱을 적용하고 나서 추가적으로 사용자 요청 정보 - 메시지 발행을 보장할 수 있는 방법에 대해 고려해보게 되었습니다.

## 아웃박스 트랜잭션 패턴

최종적으로 저희 프로젝트에 적용한 패턴입니다.

저는 처음에 사용자 요청 정보를 DB에 Insert 하는 트랜잭션을 기준으로 카프카 메시지를 발행하는 것을 고려했는데요.

두가지 방법 다 문제가 있었습니다.

1. Insert 트랜잭션 커밋 전에 메시지가 발행

이 경우에는 발행 후 모종의 사유로 커밋이 실패할 경우 최종적으로 발행하지 말아야할 메시지가 발행되게 됩니다.

2. Insert 커밋 이후 메시지 발행

이 경우 Insert 커밋 후에 메시지가 발행하는 과정에서 오류가 발생하면 사용자 요청 정보는 DB에 들어갔지만, 메시지가 발행되지 않아 사용자는 응답을 받을 수 없습니다.

이러한 점을 Transactional Outbox Pattern을 사용해서 해결할 수 있습니다.

![outbox1](/assets/img/2023-07-30-kafka-transaction-outbox/outbox1.webp)
> 이해를 돕기 위한 사진입니다.

사용자 이력서 정보를 저장할 때 별도의 테이블로 발행할 메시지 정보도 저장합니다. 이 테이블을 `Outbox`라고 합니다.

이렇게 되면 DB 트랜잭션에 의해 원자성을 보장받을 수 있기 때문에 이력서 정보와 메시지를 모두 저장하거나 저장하지 않게 됩니다.

이렇게되면 위에서 언급했던 1번,2번 커밋 순서에 따른 문제점을 해결할 수 있습니다.

그리고 메시지 발행을 스케줄링을 통해 일괄적으로 발행합니다.

![outbox2](/assets/img/2023-07-30-kafka-transaction-outbox/outbox2.webp)
> 이해를 돕기 위한 사진입니다.

이를 통해 At-Least Once Delivery 전략이라고 합니다.

저는 발행이 완료된 메시지에 대해서 process_status라는 필드를 통해 READY일 경우 발행, COMPLETE일 경우 발행하지 않게 했습니다.

```kotlin
@Entity
class Outbox(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null,

    var aggregateId: Long? = null,

    @Enumerated(EnumType.STRING)
    var aggregateType: AggregateType? = null,

    var processStatus: ProcessStatus = ProcessStatus.READY
) : BaseEntity()
```

```kotlin
class OutboxEventHandler(
    private val outboxRepository: OutBoxRepository,
    private val producerAdapter: ProducerAdapter
) {

    @Scheduled(fixedRate = 1000)
    fun publish() {
        val outboxList = outboxRepository.read(10)
        outboxList.forEach { 
            it.let { 
                producerAdapter.send(it)
                it.sendComplete()
            }
        }
    }
}
```

그러나 At-Least Once는 결국 적어도 한번일 뿐 두번 보내게 될 수도 있는데요.

이에 대해서는 아까 ENABLE_IDEMPOTENCE_CONFIG 설정을 true로 했기 때문에

같은 메시지를 수신하면 PID를 통해 비교해보고 두번째 메시지를 처리하지 않게 됩니다.

멱등성을 보장받을 수 있게 됩니다.

즉, 트랜잭션의 원자성을 이용해서 발행해야할 메시지만을 발행하고, 이는 성공할 때까지 발행됩니다.(At Least Once)

그리고 메시지를 여러번 수신하더라도 한번 수신한 것과 같이 처리하여, 최종적으로는 정확히 한번 처리됩니다.(Exactly-Once)

## TO-BE

![tobe](/assets/img/2023-07-30-kafka-transaction-outbox/tobe.webp)

트랜잭션 아웃박스 패턴을 적용한 생성 AI 서비스 로직의 플로우 차트입니다.

사용자가 보낸 메시지에 대해 분산 시스템 환경에서 메시지 처리를 보장하는 것이 중요하다고 생각해서 시작되었는데요.

이 경험을 통해 카프카를 단순히 사용해보는 것 뿐만 아니라, 옵션에 대해 더 잘 이해할 수 있었습니다.

## 레퍼런스

-[프로듀서의 전송 방법](https://ojt90902.tistory.com/1185)

-[https://microservices.io/patterns/data/transactional-outbox.html](https://microservices.io/patterns/data/transactional-outbox.html)

-[https://blog.gangnamunni.com/post/transactional-outbox/?fbclid=IwAR0xbxBfnusipaPg7gzhw1-Dz-w0SF0NotG0fKG7SUye8Mg6_68AdsHrq4E](https://blog.gangnamunni.com/post/transactional-outbox/?fbclid=IwAR0xbxBfnusipaPg7gzhw1-Dz-w0SF0NotG0fKG7SUye8Mg6_68AdsHrq4E)


