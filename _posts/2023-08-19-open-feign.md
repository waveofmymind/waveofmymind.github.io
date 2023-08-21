---
title: "OpenFeign을 활용한 외부 API 호출"
date: 2023-08-19 10:12:00 +0900
aliases: 
tags: [Open Feign,Spring Cloud Open Feign]
categories: [Spring]
---

레주마블 프로젝트를 진행하면서, 외부 API를 요청하는 로직이 있었고,

이에 대해서 기존의 `RestTemplate`을 사용하지 않고 

선언형 HTTP Client인 `Spring Cloud OpenFeign`을 통해 외부 API 호출을 한 경험을 공유하고자합니다.

### **Spring Cloud OpenFeign**

위에서 언급했던 것처럼, 선언형 HTTP Client입니다.

어노테이션 기반으로 동작하기 때문에 적용하는 것이 매우 쉬우며,

기존의 RestTemplate으로 하던 로직을 매우 단축 시킬 수 있습니다.

공식 문서에서도, 사용하는 법이 매우 간단하다고 안내하고 있습니다.

> To use Feign create an interface and annotate it.

우선 사용하는 방법을 먼저 알아보겠습니다.

### **@EnableFeignClients**

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

### **Client 구현하기**

아까 어노테이션 기반의 인터페이스로 동작한다고 나와있듯이, 페인을 사용하기 위한 클라이언트 클래스를 구현해주어야합니다.

```kotlin
@FeignClient(name = "generate-answer", url = "\${external.openai.url}", configuration = [FeignConfig::class])
interface GenerateAnswerClient {

    @PostMapping("/v1/chat/completions", consumes = ["application/json"])
    fun generateAnswer(
        request: GenerateAnswerRequest,
    ): GenerateAnswerResponse
}
```

`@FeignClient`어노테이션을 사용하기 위해서는 중요한 속성 두개가 있는데, url과 value입니다.

공식 문서에 따르면,

**url**에는 **호출할 주소**, **name**에는 `Spring Cloud LoadBalancer`의 클라이언트를 생성할때 사용된다고 합니다.

name의 경우 현재는 필요 없지만, 필수이므로 저는 특정 값을 넣어주었습니다.

만약 url이 동적으로 변경될 필요가 있을 경우, url 속성에는 아무 값이나 넣고 함수의 파라미터 인자로 넘겨주면 됩니다.

```kotlin
@FeignClient(name = "generate-answer", url = "GENERATE_ANSWER_URL", configuration = [FeignConfig::class])
interface GenerateAnswerClient {

    @PostMapping("/v1/chat/completions", consumes = ["application/json"])
    fun generateAnswer(
    	URI uri,
        request: GenerateAnswerRequest,
    ): GenerateAnswerResponse
}
```

사용하는 방법이 간단하지만, 저는 몇가지 설정을 더 해주었습니다.

### 작성 중




### **레퍼런스**

- [Spring Cloud OpenFeign](https://docs.spring.io/spring-cloud-openfeign/docs/current/reference/html/)