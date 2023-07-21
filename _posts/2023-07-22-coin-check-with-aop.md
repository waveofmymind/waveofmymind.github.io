---
title: "AOP를 활용한 토큰 체크 로직 분리하기"
date: 2023-03-29 09:29:00 +0900
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

저는 이러한 로직이 횡단 관심사라고 생각하여, AOP를 활용하여 Aspect로 분리한다면, 핵심 관심사로부터 분리하여 다양한 서비스에서도 사용할 수 있을 것이라고 생각했습니다

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

우선 저희는 SSR을 사용중이기 때문에 JSON을 반환하지 않고, 특정 조건의 분기로 페이지가 이동하도록 되어있습니다.

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

# 작성 중
