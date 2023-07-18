---
title: "헥사고날 아키텍처 적용기"
date: 2023-06-28 09:29:00 +0900
aliases: 
tags: [Clean Architecture, Hexagonal Architecture]
categories: [Spring]
---

![Hexagonal Architecture](/assets/img/2023-06-28-hexagonal-architecture/main.webp)

프로젝트 진행 중, 생성 AI 서비스의 응답 결과를 저장하기 위한 도메인을 헥사고날 아키텍처로 구성하는 경험을 공유하고자합니다.

기존의 레이어 패턴을 사용할 경우 Controller -> Service -> Repository 순으로 의존성을 가지게 됩니다.

즉, 의존성이 아래로 흐르기 떄문에 도메인 계층에서 필요로 하는 의존성이 영속성 레이어에 계속 추가될 수 있습니다.

이러한 점은 외부 시스템을 불가피하게 변경하게 될 때 문제가 발생하게 되는데, 추상화로 영속성 레이어와 도메인 레이어의 의존성을 역전시키더라도 예를 들어 Spring Data JPA가 제공하는 기술의 형태에 의존하게 됩니다.

이러한 점을 개선하기 위해 계층 자체를 어떤 레이어간에도 의존시키지 않고 계층에서는 오로지 외부로의 "포트", 내부에서는 해당 계층에 접근하기 위한 "어댑터"만을 바라보는 것이 헥사고날 아키텍처입니다.

## 헥사고날 아키텍처

![Hexagonal Architecture](/assets/img/2023-06-28-hexagonal-architecture/clean-architecture.webp)

> 각 계층에서 하던 일을 "내부와 외부"라는 개념으로 나누어 각각에 맞는 별도의 인터페이스를 두는 것

모든 외부시스템과의 상호작용은 `어댑터`, 각 서비스에서 비즈니스 로직에 맞게 정의된 인터페이스는 `포트` 라고 정의합니다.

즉, 외부 서비스와의 상호작용인 `어댑터`는 비즈니스 로직과의 작업을 `포트`와 통신하여 수행합니다.

이때 내부에서 외부에 대한 요청을 아웃바운드 포트 -> 아웃 바운드 어댑터

외부에서 내부를 인바운드 어댑터 -> 인바운드 포트로만 통신이 가능합니다.

### 어댑터

> 서비스의 입장에서 이 서비스가 사용하는 외부 시스템과의 직접적인 구현 및 상호작용

- 뷰의 요청으로 들어온 Request가 가장 처음 만나는 Controller는 `인바운드 어댑터`
- 카프카로부터 컨슘하는 동작을 처리하는 로직 핸들러는 `인바운드 어댑터`
- DB에 직접 접근하면 다양한 작업(CRUD)을 처리하기 위한 DAO는 `아웃 바운드 어댑터`(비즈니스 로직 입장에서 바깥인 DB에 접근하기 때문)

### 포트

> 비즈니스 로직 입장에서 어댑터와 통신하기 위한 동작을 정의한 인터페이스

- controller로부터 들어온 요청으로부터 특정 비즈니스 로직을 수행하기 위한 동작을 정의한 인터페이스
- 컨슘한 메시지를 처리하기 위한 비즈니스 로직의 동작을 정의한 인터페이스
-> `인바운드 포트`

- 비즈니스 로직에서 DB 접근을 위해서 정의한 Repsitory 인터페이스는 `아웃바운드 포트`

![도식화](/assets/img/2023-06-28-hexagonal-architecture/bp.webp)

즉, 외부와의 의존성을 분리하고 언제든 쉽게 교체하여 유연한 확장성을 대처하기 위한 아키텍처라고 할 수 있습니다.

의존성을 도식화 하면아래와 같이 구성되어집니다.

![Hexagonal Architecture](/assets/img/2023-06-28-hexagonal-architecture/application-persistance.webp)

이제 코어의 서비스 로직은 ORM 기술에 의존하지 않게 되며, 기술을 변경하게 되어도 변경이 전파되지 않게 됩니다.

## 영속성 어댑터

그렇다면, 서비스 로직에서 Out Port를 정의하고, 이를 구현한 영속성 어댑터는 어떻게 구현되어질까요?

저는 Prediction이라는 클래스에 대한 비즈니스 클래스로 PredictionFacade를 구현했습니다.

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PredictionFacade implements SavePredictionUseCase, FindPredictionUseCase {

    private final SavePredictionPort savePredictionPort;
    private final FindPredictionPort findPredictionPort;

    @Override
    @Transactional
    public void savePrediction(PredictionServiceRequest request) {
        Prediction prediction = request.toEntity();
        savePredictionPort.savePrediction(prediction);
    }

    @Override
    public Prediction getPrediction(Long memberId) {
        return findPredictionPort.findPredictionByMemberId(memberId).orElseThrow(() -> new BusinessException(ErrorCode.PREDICTION_NOT_FOUND));
    }

    @Override
    public List<Prediction> getPredictions(Long memberId) {
        return findPredictionPort.findPredictionsByMemberId(memberId);
    }
}
```

UseCase에 대한 비즈니스 로직을 캡슐화하고, 외부의 요청을 비즈니스 로직으로 연결하는 역할을 하게 됩니다.

그리고 SavePredictionPort와 FindPredictionPort입니다.

```java
public interface SavePredictionPort {

    void savePrediction(Prediction prediction);
}

public interface FindPredictionPort {

    Optional<Prediction> findPredictionByMemberId(Long memberId);

    List<Prediction> findPredictionsByMemberId(Long memberId);

}
```

그리고 이를 영속성 어댑터로서 PredictionPersistanceAdaptor라는 클래스를 정의했습니다.

```java
@RequiredArgsConstructor
@Service
public class PredictionPersistanceAdaptor implements SavePredictionPort, FindPredictionPort {

    private final PredictionRepository predictionRepository;
    @Override
    public void savePrediction(Prediction prediction) {
        predictionRepository.save(prediction);
    }

    @Override
    public Optional<Prediction> findPredictionByMemberId(Long memberId) {
        return predictionRepository.findByMemberId(memberId);
    }

    @Override
    public List<Prediction> findPredictionsByMemberId(Long memberId) {
        return predictionRepository.findAllByMemberId(memberId);
    }
}
``` 

PredictionRepository는 JpaRepository를 상속받은 인터페이스입니다.

위 과정을 정리하면,

UseCase를 묶은 PredictionFacade를 중심으로 기능별 포트가 존재하며, 이에 대한 외부 서비스의 접근으로 영속성 어댑터가 구현되어있습니다.


결괴적으로, 도메인 코드가 더이상 외부 시스템에 의존하지 않게 되었습니다.

또한 저수준인 포트, 어댑터가 UseCase를 의존하게 되었습니다.

## 개발하면서 느낀점

저는 MVC 중심의 레이어 패턴을 중심으로 스프링 부트 프로젝트를 개발해왔기에 클린 아키텍처를 접했을 때는 각 계층 클래스 명이 난해하고, 디렉토리 구조도 이해하기 어려웠습니다.

또한 DTO의 경우도 Controller에서 Service, Service에서 Repository에 레이어 간 이동시에도 사용했었는데요.

그렇기 때문에 도메인과 영속성간의 강한 결합이 존재했고, 실제로 JPA에서 R2DBC나, 다른 ORM 기술을 사용하게 되었을 때 분리하는 것이 어려웠습니다.

그래서 이번 기회에 실제로 크지 않은 규모의 비즈니스 로직을 구현할때 적용해보니 포트 인터페이스를 좁게 가져가면서 포트마다 다른 유연성을 가지고 개발을 할 수 있으면서도 도메인 계층이 완전히 분리될 수 있었습니다.

또한 서비스 로직이 점점 비대해지는 문제가 있었는데, 이 또한 유즈케이스 단위로 분리하게 되어 명확히 코드를 파악할 수 있다는 장점이 있었습니다.

그렇지만 개인적으로 다음에는 다시 사용하지 않을 것 같습니다.

일단, 로직이 추가될수록 인-아웃별로도 인터페이스를 생성하기 때문에 관리해야할 클래스가 너무 많아집니다.

또한 제 입장에서 프로젝트를 진행하며, 기술을 변경할 여지가 있는가? 였습니다.

제일 큰 장점으로는 도메인 헥사고날을 중앙에 두고, 유즈케이스를 기준으로 외부와의 기술을 포트와 어댑터로 통신하는 이 방식이, 기술의 변경을 쉽게 할 수 있다고 많이들 얘기합니다.

물론 큰 규모의 회사나, 최종적으로 어떤 기술을 사용할지 정해지지 않은 프로젝트의 경우에는 사용할 여지가 있을 것이라고 생각하지만, 현재 제가 헥사고날 아키텍처를 사용해야할 이유가 없을 것 같습니다.





