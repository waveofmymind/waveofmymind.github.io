---
title: "AOP를 활용한 토큰 체크 로직 분리하기"
date: 2023-07-21 09:29:00 +0900
aliases: 
tags: [Lock,JPA]
categories: [Trouble Shooting]
---

굿잡 프로젝트에서 생성 AI 서비스인 이력서 검토, 면접 예상 질문 서비스를 사용하기 위해서는

회원이어야하고,매일 회원에게 주어지는 10개의 토큰을 차감하는 방식으로 사용할 수 있습니다.

그러기 위해서는 다음과 같은 순서로 로직이 필요한데요.

1. 토큰이 1개 이상인지 체크
2. 토큰 감소
3. 서비스 이용

이때 1번과 2번은 추후 신규 서비스에서 코인을 이용하게 될 경우 쓰여질 수 있기 때문에 AI 서비스에서 사용했던 토큰 체크 및 감소 로직을 중복해서 사용하게 됩니다.

저는 이러한 로직이 횡단 관심사라고 생각했습니다.
이를 AOP를 활용해서 Aspect로 분리한다면, 핵심 관심사로부터 분리하여 다양한 서비스에서도 사용할 수 있을 것이라고 생각했습니다

그러한 적용기를 공유하는 글입니다.

## AS-IS

기존 AI 서비스를 이용하는 로직에서 코인 체크 및 감소 로직을 추가했을 때의 코드는 아래와 같아집니다.

```java
@PostMapping("/questions")
public String generateQuestion(@ModelAttribute CreatePromptRequest request) throws JsonProcessingException {
    if (rq.getMember() == null) {
        request.setMemberId(null);
    } else {
        request.setMemberId(rq.getMember().getId());
        boolean isServiceAvailable = coinUt.isServiceAvailable(rq.getMember());

        if (!isServiceAvailable) {
            return "resume/coin-shortage";
    }

    kafkaPredictionProducer.sendQuestionRequest(objectMapper.writeValueAsString(request));
    }

    return "resume/request-complete";
    }
```

(저희는 SSR을 사용중이기 때문에 JSON을 반환하지 않고, 특정 조건의 분기로 페이지가 이동합니다.)

위에서 코인 체크 및 감소 로직은 아래와 같습니다.

```java
boolean isServiceAvailable = coinUt.isServiceAvailable(rq.getMember());

if (!isServiceAvailable) {
   return "resume/coin-shortage";
}

public boolean isServiceAvailable(Member member) {
        // 유료 회원인 경우 코인 없이 이용 가능
    if (!member.isFree()) {
       return true;
    }

    Integer coin = member.getCoin();

    if (coin < 1) {
        return false;
    }

    memberService.deductCoin(member); // 코인 감소

    return true;
}
```

저희는 일반 회원 외에 유료 회원도 존재하는데, 유료 회원인 경우에는 토큰 없이 무제한으로 이용이 가능합니다.

그렇기 때문에 `isServiceAvailable()` 함수에서 가장 첫 조건으로 회원이 유료 회원인 경우를 체크합니다.

무료 회원인 경우에는 현재 회원의 Coin 개수를 가져와서

1개보다 적은지를 체크하고, 서비스 이용이 가능할 경우 `deductCoin()` 함수를 통해 코인을 감소시키고 함수 전체에 대해 `true` 를 반환합니다.

즉, 사용 조건은 아래와 같습니다.

1. 유료 회원인 경우
2. 코인이 1개 이상인 경우

이러한 로직은 다른 서비스에서도 코인을 사용하게 될 경우 거의 동일 할 것인데요.

회원을 사용하는 일반적인 로직이기 때문에 이를 분리하여 Aspect로 정의해도 추후 어노테이션만으로 코인 체크를 할 수 있을 것이라고 기대했습니다.

## 스프링 AOP

AOP는 Aspect Oriented Promgramming의 약자로 관점 지향 프로그래밍을 의미합니다.

특정 로직에서 관심사를 기준으로 핵심, 부가로 나누어 관점을 기준으로 모듈화를 하는 것입니다.

제 비즈니스 로직에서 핵심 관심사는 AI 서비스, 부가적인 관점은 코인 체크를 의미한다고 볼 수 있습니다.

AOP에 대한 개념은 다루지 않고, 핵심 개념만 간단히 설명하겠습니다.

### Join Point

![joinPoint](/assets/img/2023-07-21-coin-check-with-aop/joinpoint.webp)

말 그대로 진입점이라고 할 수 있습니다.

타겟 내에서 AOP가 적용될 수 있는 위치를 의미합니다.

### Aspect

![aspect](/assets/img/2023-07-21-coin-check-with-aop/aspect.webp)

가장 중요한 것으로, 횡단 관심사를 모듈화한 것입니다.

그 외에는 PointCut도 있는데, 이는 위 JoinPoint 중 실제로 적용할 JoinPoint라고 생각하면 됩니다.

세가지 개념을 정리하면 아래와 같이 나타낼 수 있습니다.

![summary](/assets/img/2023-07-21-coin-check-with-aop/summary.webp)

이를 스프링에서는 프록시 패턴으로 제공하고 있는데, 이유는 AOP를 추가하더라도 기존 코드 변경 없이 사용할 수 있기 때문입니다.

## CoinCheckAspect

우선 분리한 관심사를 모듈화한 Aspect를 정의해보겠습니다.

```java
@Slf4j
@Aspect
@RequiredArgsConstructor
@Component
public class CoinCheckAspect {

    private final CoinUt coinUt;

    private final MemberService memberService;

    @Around("@annotation(com.goodjob.member.coin.CoinCheck)")
    public Object coinCheck(ProceedingJoinPoint joinPoint) throws Throwable {
        Object[] args = joinPoint.getArgs();

        CreatePromptRequest request = (CreatePromptRequest) args[0];

        Long memberId = request.getMemberId();

        Member member = memberService.findMemberById(memberId);

        boolean isServiceAvailable = coinUt.isServiceAvailable(member);

        if (!isServiceAvailable) {
            throw new BusinessException(ErrorCode.COIN_LACK);
        }

        return joinPoint.proceed();
    }
}
```

### @Around

이제 횡단 관심사에 대한 Aspect를 정의했으니 타겟 함수에 어떻게 적용할 것인지를 정해야하는데요.

이때 사용되는 것이 @After, @Around, @Before입니다.

**@Before("${pattern}")**
- 지정한 패턴에 해당하는 함수가 실행되기 전에 인터셉터와 같이 동작합니다.
- 이 어노테이션이 붙은 메서드는 리턴이 void여야합니다.

**@After("${pattern}")**
- 지정한 패턴에 해당하는 함수가 실행된 후에 동작합니다.
- 마찬가지로 리턴이 void여야합니다.

**@Around("${pattern}")**
- 지정한 패턴에 해당하는 함수의 실행 전, 실행 후 모두 동작합니다.
- 이 어노테이션이 붙은 함수의 반환값은 Object여야합니다.

그리고 각 pattern은 pointcut 표현식으로, 패턴을 어떻게 적용할 것인지를 정하게됩니다.

저는 어노테이션을 사용해서 Aspect를 적용할 것이기에 @CoinCheck 어노테이션을 지정했습니다.

포인트 컷 작성 가이드는 [여기](https://www.baeldung.com/spring-aop-pointcut-tutorial)를 참고해주세요.

## TO-BE

이제 AOP를 적용한 후의 함수는 다음과 같아졌습니다.

```java
@PostMapping("/questions")
@CoinCheck
public String generateQuestion(@ModelAttribute CreatePromptRequest request) throws JsonProcessingException {
    if (rq.getMember() == null) {
        request.setMemberId(null);
    } else {
        request.setMemberId(rq.getMember().getId());

        kafkaPredictionProducer.sendQuestionRequest(objectMapper.writeValueAsString(request));
    }

    return "resume/request-complete";
}
```

(여기서 CreatePromtRequest는 단순 DTO이기 때문에 memberId에 대한 setter를 사용했습니다.)

이제 코인 개수 체크 및 차감을 하는 로직을 분리시켰기 때문에

해당 함수는 오직 질문을 생성하기 위해 카프카 프로듀서로 메시지를 보내는 역할만 하게 됩니다.

이제 코인 개수가 정상적으로 차감되는지 확인해보겠습니다.

![result1](/assets/img/2023-07-21-coin-check-with-aop/result1.webp)

위 내용을 입력하고 제출을 누르면,

![result2](/assets/img/2023-07-21-coin-check-with-aop/result2.webp)

정상적으로 코인이 차감되었습니다.

만약 코인을 사용하는 서비스가 생겨나더라도, 코인 체크 로직을 새로 구현할 필요 없이

`@CoinCheck` 어노테이션으로 코인에 대한 검증과 감소 로직을 적용할 수 있게 되었습니다.














