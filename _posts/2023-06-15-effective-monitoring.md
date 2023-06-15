---
title: "효과적인 비즈니스 로직 모니터링(with AOP)"
date: 2023-06-15 21:29:00 +0900
aliases: 
tags: [Spring,Spring Boot,AOP,Grafana,Spring Actuator,Monitoring]
categories: [Spring]
---

팀 프로젝트를 진행하면서 CPU와 JVM, 로그 모니터링은 구성했지만, 비즈니스 로직에 대한 모니터링이 더 효과적으로 이루어져야 한다고 생각했습니다.

따라서, 비즈니스 로직의 요청부터 응답까지의 시간과 요청 횟수 등을 모니터링하기 위해 커스텀 메트릭을 추가하기로 결정했습니다.

## AS-IS

![수많은 대시보드..](/assets/img/2023-06-15-effective-monitoring/normal.webp)

저는 기존 템플릿 사용보다, 애플리케이션 관리에 필수적인 모니터링 대상을 찾아가며 단계적으로 적용해 나갔습니다. 

모니터링 요소들이 추가되면서 대시보드는 눈에 띄게 개선되었고, 굉장히 만족스러워졌습니다.

그렇지만 동시에, 개발 작업 중 실제로 마주하는 비즈니스 로직의 모니터링은 전혀 없었기 때문에, 이런 것들이 실제 운영에 도움을 줄지 의문이 들었습니다.

그래서 필수 자원 외에도 서비스 관련 대시보드를 구성한다면, 이슈가 발생하더라도 그라파나를 통해 한눈에 확인할 수 있기 때문에 모니터링을 모니터링답게 사용할 수 있을 것이라고 기대했습니다.

## Timer 사용하기

먼저, 중요하다고 생각한 비즈니스 로직은 이력서 검토와 면접 예상 질문 서비스의 시간 측정이었습니다.

요청 데이터에 따라 응답 시간이 다양했기 때문에, 기록을 통해 예컨대 타임아웃 시간을 초과하는 기록이 있다면 해당 시간에 대한 이슈 추적이 훨씬 효율적일 것으로 판단했습니다. 

마이크로미터의 시간을 측정해주는 Timer 객체를 사용할 것인데, 이를 사용하면 다음과 같은 내용을 측정할 수 있습니다.
- seconds_count: 누적 실행 수
- seconds_sum: 실행 시간의 합
- seconds_max: 최대 실행 시간(가장 오래걸린 실행 시간)

```java
public interface Timer extends Meter, HistogramSupport {  
        void record(long amount, TimeUnit unit);  
    <T> T recordCallable(Callable<T> f)  
    static Sample start()  
}
```

Builder 패턴을 지원하기 때문에 다음과 같이 타이머 객체를 생성할 수 있습니다.

```java
Timer timer = Timer.builder("gpt.service").register(registry)
        .tag("class", this.getClass().getName())
        .tag("method", "createQuesionAndOrder")
        .description("CreateQuestionAndAnswer")
        .registry(registry)
```
위에서 정의한 태그는 추후 그라파나 fromQL에서 사용할 것이므로 적절하게 정해줍니다.

그리고 생성한 타이머의 record 메서드를 사용하면,
```java
timer.record(() -> {
        //이력서 검토 or 면접 예상 질문 로직
});
```
와 같이 사용할 수 있습니다.

그리고 아까 정의했던 경로로 들어가줍니다.
만약 로컬 환경이라면, http://localhost:8080/actuator/metrics/gpt.service가 될 것입니다.

접속해보면, 아래와 같이 JSON 형식으로 나옵니다.

![커스텀 메트릭1](/assets/img/2023-06-15-effective-monitoring/timer-first.webp)

요청 횟수와 총 시간이 측정되었습니다.

그런데 한 가지 불편한 점이 있습니다.

바로 시간 측정을 위한 메서드를 record 메서드의 람다식 안에 넣어야 한다는 점입니다.

이것을 AOP의 관점으로 보면 면접 예상 질문을 생성하는 로직이 **핵심적인 관점**, 그리고 시간을 기록하는 로직은 **부가적인 관점**으로 나누어서 횡단 관심사를 해결하고자 접근할 수 있는데요.

마이크로미터에서는 이에 대한 문제를 해결하고자 Aspect를 사용한 어노테이션을 지원합니다.

## Aspect를 활용한 @Timed 사용하기

간단합니다.

@Timed 어노테이션을 기록하고자 하는 메서드, 클래스에 붙이면 위에서 얘기했던 누적 합, 최대 시간, 누적 실행 수를 기록해줍니다.

클래스 단위에 붙이면 해당 클래스의 모든 메서드에 대해서 기록을 해줍니다.

우선, TimeAspect를 정의해야합니다.

```java
@Configuration
public class MetricConfig {

        @Bean
        public TimeAspect timedAspect(MeterRegistry registry) {
                return new TimedAspect(registry);
        }
}

위 설정이 없으면 동작하지 않으니 반드시 정의해야합니다.

그리고 이제 기록하고자 하는 곳에 어노테이션을 붙여줍니다.

```java
@Timed("gpt.service")
public GptGeneratedService {

	//예상 질문 생성 메서드

	//...

	//이력서 검토 조언 생성 메서드
}
```

위 주석에 있는 모든 메서드에 대해서 기록을 해주게 됩니다.

다시 /gpt.service 경로로 들어가보면

```json
{
	"name": "gpt.service",
	"baseUnit": "seconds",
	"measurements": [
		{
			"statistic": "COUNT",
			"value": 18
		},
		{
			"statistic": "TOTAL_TIME",
			"value": 797.08818632
		},
		{
			"statistic": "MAX",
			"value": 0
		}
	],
	"availableTags": [
		{
			"tag": "exception",
			"values": [
				"BusinessException",
				"none"
			]
		},
		{
			"tag": "method",
			"values": [
				"createdImprovementPointsAndAdvice",
				"createdExpectedQuestionsAndAnswer"
			]
		},
		{
			"tag": "application",
			"values": [
				"goodjob"
			]
		},
		{
			"tag": "class",
			"values": [
				"com.goodjob.domain.gpt.GptService"
			]
		}
	]
}
```

그리고 메트릭을 얻어오기위해 프로메테우스 경로로 들어가보면,

![프로메테우스](/assets/img/2023-06-15-effective-monitoring/prometheus.webp)

모든 메서드에 대해 지원하고 있음을 확인할 수 있습니다.

또한 @Timed 어노테이션에는 더 많은 속성을 지원하고 있습니다.
- value: 메트릭 이름 지정, 기본값은 빈 문자열
- extraTags: 타이머에 추가 태그를 지정할 수 있다.(key-value)
- longTask: LongTaskTimer 활성화

등이 있으니 입맛에 맞춰 사용하시면 됩니다.

이제 위 메트릭을 그라파나를 이용해서 적용하기만 하면 됩니다.

### value에 설정한 경로로 가도 안나올 경우

해당 클래스에 대한 메서드를 한번도 사용하지 않으면 메트릭이 노출되지 않기 때문에 나오지 않습니다.

한번이라도 사용한 후 접속해보면 노출됩니다.

## TO-BE

저는 아래와 같이 구성했습니다.

![비즈니스 로직 모니터링](/assets/img/2023-06-15-effective-monitoring/result.webp)

생성 AI 서비스인 이력서 검토 조언 생성 및 면접 예상 질문 서비스에 대한 응답 시간을 각각 평균으로 나타내고, 최대 소모 시간, 누적 시간을 나타냈습니다. 

실제로 위와 같이 구성 후, 특정 요청에 대해 타임 아웃 이슈가 있어서 대시보드에 기록된 시간을 AWS CloudWatch 콘솔에 접속하여 로그를 트래킹한 후, 이슈를 빠르게 대처하고 해결할 수 있었습니다.

본 게시글에서는 타이머를 사용해서 시간을 기록하는 것에 대해서 다루었지만, 카운터나 게이지 등을 사용하면 서비스에 맞는 모니터링 환경을 구성할 수 있을 것입니다.



## 레퍼런스

- [마이크로미터 공식 문서](https://micrometer.io/docs/concepts#_storing_start_state_in_timer_sample)

- [토리맘의 한글라이즈 프로젝트 - Metrics](https://godekdls.github.io/Spring%20Boot/metrics/#timed-annotation-support)

- [처리/응답시간 메트릭 수집하기](https://blog.leocat.kr/notes/2021/02/01/micrometer-collect-duration-with-timer)
