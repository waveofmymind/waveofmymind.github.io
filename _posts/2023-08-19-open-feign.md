---
title: "OpenFeign을 활용한 외부 API 호출"
date: 2023-08-19 10:12:00 +0900
aliases: 
tags: [Open Feign,Spring Cloud Open Feign]
categories: [Spring]
---

레주마블 프로젝트를 진행하면서, 외부 API를 요청하는 로직이 있었고,

이에 대해서 기존의 `RestTemplate`을 사용하지 않고 

선언형 HTTP Client인 `Spring Cloud OpenFeign`을 통해 외부 API 호출을 한 경험을 공유하고자 합니다.

### RestTemplate

```kotlin
@Service
class InterviewQuestionService(
    private val restTemplate: RestTemplate
) {
    @Value("\${external.openai.token}")
    private lateinit var token: String

    fun generateInterviewQuestion(request: ChatCompletionsRequest): ChatCompletionsMessageResponse {
        val headers = HttpHeaders()
        headers.contentType = MediaType.APPLICATION_JSON
        headers.set("Authorization", "Bearer $token")

        val entity = HttpEntity(request, headers)
        val url = "\${external.openai.url}/v1/chat/completions"

        val response = restTemplate.postForEntity(url, entity, ChatCompletionsMessageResponse::class.java)

        return response.body ?: throw RuntimeException("요청에 실패했습니다.")
    }
}
```

처음에 구현한 RestTemplate을 사용한 외부 API 호출입니다.

요청시 다양한 값이 포함되어야하기 때문에 간단한 로직이더라도 코드가 번거롭습니다.

하나의 함수를 사용할 때에는 RestTemplate을 사용해도 상관 없지만,

추가적으로 API 호출이 필요할 경우, 이러한 함수를 계속 구현하는 것은 번거로운 행위가 아닐 수 없습니다.

그래서 사용하게 된 것이 `Spring Cloud OpenFeign`입니다.


### 📌 **Spring Cloud OpenFeign**

위에서 언급했던 것처럼, **선언형 HTTP Client**입니다.

어노테이션 기반으로 동작하기 때문에 적용하는 것이 매우 쉬우며,

기존의 RestTemplate으로 하던 로직을 매우 단축 시킬 수 있습니다.

공식 문서에서도, 사용하는 법이 매우 간단하다고 안내하고 있습니다.

> To use Feign create an interface and annotate it.

단지 인터페이스로 생성하고, 어노테이션을 붙이기만 하면 됩니다.

우선 사용하는 방법을 먼저 알아보겠습니다.

### 📌 **@EnableFeignClients**

페인을 활성화하기 위해 필요한 어노테이션으로, 보통 Application 클래스에 많이 붙이곤 하는데요.

저는 별도의 `FeignConfig`가 존재하기 때문에, 이에 붙여주겠습니다.

```kotlin
@Configuration
@EnableFeignClients("resumarble.core.domain.gpt")
@Import(FeignClientsConfiguration::class)
class FeignConfig {

    @Bean
    fun retry() = Retryer.Default(
        INITIAL_BACKOFF_PERIOD,
        MAX_BACKOFF_PERIOD,
        MAX_RETRY_ATTEMPTS
    )

    companion object {
        const val INITIAL_BACKOFF_PERIOD: Long = 1000 * 5
        const val MAX_BACKOFF_PERIOD: Long = 1000 * 5
        const val MAX_RETRY_ATTEMPTS = 3
    }
}
```

`@EnableFeignClients`에 특정 폴더 경로가 포함되어있는데, 이는 밑에서 설명하겠습니다.

### 📌 **Client 구현하기**

아까 어노테이션 기반의 인터페이스로 동작한다고 나와있듯이, 페인을 사용하기 위한 클라이언트 클래스를 구현해주어야합니다.

```kotlin
@FeignClient(name = "generate-answer", url = "\${external.openai.url}", configuration = [FeignConfig::class])
interface InterviewQuestionClient {

    @PostMapping("/v1/chat/completions", consumes = ["application/json"])
    fun generateCompletion(
        request: ChatCompletionRequest,
    ): ChatCompletionResponse
}
```

`@FeignClient`어노테이션을 사용하기 위해서는 중요한 속성 두개가 있는데, url과 value입니다.

공식 문서에 따르면,

**url**에는 **호출할 주소**, **name**에는 `Spring Cloud LoadBalancer`의 클라이언트를 생성할때 사용된다고 합니다.

name의 경우 현재는 필요 없지만, 필수이므로 저는 특정 값을 넣어주었습니다.

만약 url이 동적으로 변경될 필요가 있을 경우, url 속성에는 아무 값이나 넣고 함수의 파라미터 인자로 넘겨주면 됩니다.

```kotlin
@FeignClient(name = "generate-answer", url = "GENERATE_ANSWER_URL", configuration = [FeignConfig::class])
interface InterviewQuestionClient {

    @PostMapping("/v1/chat/completions", consumes = ["application/json"])
    fun generateCompletion(
    	URI uri, // 추가한 부분
        request: ChatCompletionRequest,
    ): ChatCompletionResponse
}
```

사용하는 방법이 간단하지만, 저는 몇가지 설정을 더 해주었습니다.

### 📌 **Retry 설정**

요청에 대해 재시도를 설정할 수 있습니다.

OpenFeign의 경우 Default가 `Retryer.NEVER_RETRY`입니다.

즉, 재시도를 하지 않습니다.

이러한 점을 Config 클래스에 빈으로 재정의해서 등록해주면 됩니다.

```kotlin
@Configuration
@EnableFeignClients("resumarble.core.domain.gpt.client")
@Import(FeignClientsConfiguration::class)
class FeignConfig {

    @Bean
    fun log() = Logger.Level.FULL

    @Bean
    @Primary
    fun retry() = Retryer.Default(
        INITIAL_BACKOFF_PERIOD,
        MAX_BACKOFF_PERIOD,
        MAX_RETRY_ATTEMPTS
    )

    companion object {
        private const val INITIAL_BACKOFF_PERIOD: Long = 1000 * 5
        private const val MAX_BACKOFF_PERIOD: Long = 1000 * 5
        private const val MAX_RETRY_ATTEMPTS = 3
    }
}
```
저는 위와 같이 설정했으며, 다음과 같이 동작합니다.

1. 첫번째 호출 실패시 5초 후 재시도
2. 두번째 호출(1번 과정) 실패시 5초 후 재시도
3. 세번째 호출(2번 과정) 실패시 5초 후 재시도
4. 네번째 호출(3번 과정) 실패시 예외 발생

### 📌 **로깅 설정**

요청에 대해 로그를 남길 수 있습니다.

다음과 같은 로그 수준을 제공하고 있습니다.

- NONE: 로깅하지 않음(기본값)
- BASIC: 요청 메소드와 URI와 응답 상태와 실행시간만 로깅함
- HEADERS: 요청과 응답 헤더와 함께 기본 정보들을 남김
- FULL: 요청과 응답에 대한 헤더와 바디, 메타 데이터를 남김

그리고 주의할 점은, Feign의 경우 DEBUG 레벨로만 로그를 남길 수 있기 때문에,

로그 레벨을 DEBUG로 설정해주어야합니다.

```yaml
logging:
  level:
    resumarble.core.domain.gpt.client: DEBUG
```

### 📌 **Client 인터페이스를 주입받을 수 없을 때**


Client를 인터페이스로 생성했고, `@EnableFeignClients`도 선언했지만 빈으로 생성되지 않아 주입이 안되는 현상이 발생했습니다.

GPT한테도 여쭤보았지만 부트 어플리케이션에 @EnableFeignClients를 붙이지 않아서라는 말만 반복됬습니다.

이는 부트 어플리케이션 클래스가 아닌, 별도의 @Configuration 클래스로 생성할 때 발생한 문제였고,

이는 Client 인터페이스의 위치를 `@EnableFeignClients`의 속성으로 넘여주어야 합니다.

```kotlin
@Configuration
@EnableFeignClients("resumarble.core.domain.gpt.client")
@Import(FeignClientsConfiguration::class)
class FeignConfig
```

### 📌 **레퍼런스**

- [Spring Cloud OpenFeign](https://docs.spring.io/spring-cloud-openfeign/docs/current/reference/html/)

- [[Spring] OpenFeign이란? OpenFeign 소개 및 사용법](https://mangkyu.tistory.com/278)

- [[Spring] OpenFeign 타임아웃(Timeout), 재시도(Retry), 로깅(Logging) 등 설정하기](https://mangkyu.tistory.com/279)