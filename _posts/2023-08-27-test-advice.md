---
title: "테스트시 ControllerAdvice에 의해 예외가 잡히지 않는 경우"
date: 2023-08-27 10:12:00 +0900
aliases: 
tags: [kotest,test,unit test]
categories: [Spring]
---

컨트롤러 테스트를 진행 중, 실패 테스트를 모킹으로 구현하게 되었고, 그 중 발생한 문제에 대해 다루고 있습니다.

## **AS-IS**

주로 모킹을 사용해서 API 테스트를 구현하고 있습니다.

우선 테스트 속도가 빠르며, 이는 실제 DB 커넥션과 같이 네트워크를 타지 않기 때문입니다. 

그리고 CI를 통한 지속적인 통합 환경에서도 어떤 환경에 종속되지 않고 테스트를 진행할 수 있기 때문에, 테스트의 검증으로써 역할을 충실히 하고있다고 생각합니다.

면접 예상 질문을 생성하는 API의 경우 아래와 같이 구현했습니다.

```kotlin
@RestController
@RequestMapping("/resumes")
class ResumeController(
    private val resumeFacade: ResumeFacade
) {
    @PostMapping("/interview-questions")
    fun interviewQuestions(
        @RequestBody request: InterviewQuestionRequest
    ): Response<InterviewQuestionResponse> {
        val command = request.toCommand()
        return Response.ok(resumeFacade.generateInterviewQuestion(command))
    }
}
```

resumeFacade를 사용해서 면접 예상 질문을 생성하는 간단한 로직이기 때문에 아래와 같이 API 성공 테스트를 구현할 수 있었는데요.

```kotlin
class ResumeControllerTest : DescribeSpec() {

    init {
        val resumeFacade: ResumeFacade = mockk<ResumeFacade>()
        val objectMapper = ObjectMapper()
        val sut = MockMvcBuilders.standaloneSetup(ResumeController(resumeFacade)).build()

        describe("ResumeController") {
            val request = ResumeFixture.interviewQuestionRequest()
            val response = ResumeFixture.interviewQuestionResponse()
            context("면접 예상 질문을 생성 요청하면") {
                every { resumeFacade.generateInterviewQuestion(any()) } returns response
                it("면접 예상 질문을 생성한다.") {
                    sut.perform(
                        post("/resumes/interview-questions")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(request))
                    ).andDo { print() }
                        .andExpect {
                            status().isOk
                            content().json(objectMapper.writeValueAsString(response))
                        }
                }
            }
        }
    }
}
```

인프콘에서 코틀린 세션에서 얻은 팁인데, init 블록에서 테스트를 실행할 경우, 더 빠르게 테스트가 실행됩니다.

`every {}`를 사용해서 요청 API에 대한 핸들러 메서드 내의 `generateInterviewQuestion()`를 `response`를 반환하도록 하였고,

검증부에서는 요청 결과의 content가 response와 일치하는지를 비교했습니다.

다음으로는 면접 예상 질문 생성 실패에 대한 테스트를 구현하고자 했습니다.

저는 Chat GPT API를 사용해서 서비스를 구현하고 있는데, 이는 `ChatCompletion`을 통해 서비스를 이용하기 때문에 요청 실패시 다음과 같은 커스텀 예외를 작성했습니다.

```kotlin
data class CompletionFailedException(
    override val errorCode: ErrorCode = ErrorCode.REQUEST_FAILED
) : BusinessException(ErrorCode.REQUEST_FAILED)
```

그리고 이는 `GlobalExceptionHandler`에 의해 핸들되어 400(Bad_Request)로 내려집니다.

```kotlin
 @ExceptionHandler(CompletionFailedException::class)
    fun handleCompletionFailedException(e: CompletionFailedException): Response<Any?> {
        return Response.fail(e.errorCode)
    }
```

그래서 이에 대한 테스트 코드도 모킹을 통해 throws를 하면 되지 않을까 해서 작성해보았습니다.

```kotlin
context("면접 예상 질문 생성에 실패하면") {
   every { resumeFacade.generateInterviewQuestion(any()) } throws CompletionFailedException()
    it("404를 반환한다.") {
        sut.perform(post("/resumes/interview-questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request))
                ).andDo { print() }
                .andExpect {
                        status().isBadRequest
                    }
                }
            }
```

당연히 예외 발생을 강제했으니, status가 400으로 떨어질 것이라고 생각했기 때문입니다.

그 결과는 테스트 실패였습니다.

```
jakarta.servlet.ServletException: Request processing failed: CompletionFailedException(errorCode=REQUEST_FAILED)
	at org.springframework.web.servlet.FrameworkServlet.processRequest(FrameworkServlet.java:1019)
	at org.springframework.web.servlet.FrameworkServlet.doPost(FrameworkServlet.java:914)
	at jakarta.servlet.http.HttpServlet.service(HttpServlet.java:590)
	at org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:885)
	at org.springframework.test.web.servlet.TestDispatcherServlet.service(TestDispatcherServlet.java:72)
	at jakarta.servlet.http.HttpServlet.service(HttpServlet.java:658)
```

로그를 보게되면 실제로 `CompletionFailedException` 예외가 발생했습니다.

## **Challenge**

저는 기존의 비즈니스 로직에 대한 예외 테스트를 구현하던 것 처럼, `shouldThrown`으로 예외 스코프를 잡아보려고 했습니다.

```kotlin
context("면접 예상 질문 생성에 실패하면") {
   every { resumeFacade.generateInterviewQuestion(any()) } throws CompletionFailedException()
    it("404를 반환한다.") {
    	shouldThrow<CompletionFailedException> {
        sut.perform(post("/resumes/interview-questions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request))
                ).andDo { print() }
                .andExpect {
                        status().isBadRequest
        					}
       }
    }
}
``` 

위처럼 `shouldThrow<>()`를 사용하면 해당 스코프 내에서 실행된 함수에 대해서 예외 발생 검증을 할 수 있습니다.

이전 문제에서 `CompletionFailedException`이 발생은 했으니, `shouldThrow<>()`로 잡힐 것이다라고 판단했습니다.

그러나 마찬가지로 테스트는 실패했습니다.

```
Expected exception resumarble.core.global.error.CompletionFailedException but a ServletException was thrown instead.
java.lang.AssertionError: Expected exception resumarble.core.global.error.CompletionFailedException but a ServletException was thrown instead.
	at resumarble.api.resume.ResumeControllerTest$1$2$2.invokeSuspend(ResumeControllerTest.kt:78)
	at resumarble.api.resume.ResumeControllerTest$1$2$2.invoke(ResumeControllerTest.kt)
	at resumarble.api.resume.ResumeControllerTest$1$2$2.invoke(ResumeControllerTest.kt)
```

이번에는 예상된 예외가 아닌 다른 예외, ServletException이 발생해서 테스트에 실패했다는 내용입니다.

디버깅을 해보면 `CompletionFailedException`을 던졌음에도 불구하고 `ServletExcepion`이 발생한 이유는, 컨트롤러 단에서 처리하지 못하고 최종적인 `WAS`까지 예외가 전파되어 `sendError()`을 호출하고, 이에 따라 클라이언트에게 최종적으로 내려지게 되는 것입니다.


## **TO-BE**

`ServletException`이 발생하는 이 테스트를 통과시키기 위해서 `shouldThrow<ServletExcepion> {}`로 스코프를 변경하면 됩니다.

그렇지만 추후 예외 네이밍이나 실제 예외가 발생했는지를 검증하는 추가적인 유지보수가 필요할때, 단순히 ServletException이 발생하므로 테스트 상에서 변경할 점을 찾지 못하고, 실질적인 예외 발생 테스트를 하지 못하게 되는 것입니다.

그리고 한가지, 저희는 GlobalExceptionHandler로 `ControllerAdvice`를 정의했는데도 `CompletionFailedException`이 잡히지 못하고 클라이언트까지 예외가 전파되는 문제를 해결하지 못했습니다.

해결 방법은 생각보다 단순했습니다.

`GlobalExceptionHandler`도 스프링 빈이기 때문에, 실제 서버가 실행될 때 발생하는 예외를 처리해주는 것이지, 테스트를 실행할 때 발생한 예외에 대해서는 처리해주지 못한다는 것입니다.

그래서 `mockMvc`를 이용해서 테스트 환경에서도 `GlobalExceptionHandler`를 통해 예외를 잡고싶을 경우에는 아래와 같이 하면 됩니다.

```kotlin
val sut = MockMvcBuilders.standaloneSetup(ResumeController(resumeFacade))
            .setControllerAdvice(GlobalExceptionHandler())
            .build()
```

`setControllerAdvice()`를 확인해보면 다음과 같습니다.

```java
	/**
	 * Register one or more {@link org.springframework.web.bind.annotation.ControllerAdvice}
	 * instances to be used in tests (specified {@code Class} will be turned into instance).
	 * <p>Normally {@code @ControllerAdvice} are auto-detected as long as they're declared
	 * as Spring beans. However since the standalone setup does not load any Spring config,
	 * they need to be registered explicitly here instead much like controllers.
	 * @since 4.2
	 */
	public StandaloneMockMvcBuilder setControllerAdvice(Object... controllerAdvice) {
		this.controllerAdvice = instantiateIfNecessary(controllerAdvice);
		return this;
	}
```

실제 애플리케이션 환경에서는 `@ControllerAdvice`가 붙은 클래스를 찾아 빈으로 등록해주지만,

저는 sut객체를 생성할 때 `standaloneSetup()`으로 필요한 Spring 설정만을 로드하기 때문에 수동적으로 `setControllerAdvice()`로 등록해주어야합니다.

이제 테스트를 돌려보면 정상적으로 400(BAD_REQUEST)가 발생하는 것을 검증할 수 있습니다.

```kotlin
class ResumeControllerTest : DescribeSpec() {

    init {
        val resumeFacade: ResumeFacade = mockk<ResumeFacade>()
        val objectMapper = ObjectMapper()
        val sut = MockMvcBuilders.standaloneSetup(ResumeController(resumeFacade))
            .setControllerAdvice(GlobalExceptionHandler())
            .build()

        describe("ResumeController") {
            val request = ResumeFixture.interviewQuestionRequest()
            val response = ResumeFixture.interviewQuestionResponse()
            context("면접 예상 질문을 생성 요청하면") {
                every { resumeFacade.generateInterviewQuestion(any()) } returns response
                it("면접 예상 질문을 생성한다.") {
                    sut.perform(
                        post("/resumes/interview-questions")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(request))
                    ).andDo { print() }
                        .andExpect {
                            status().isOk
                            content().json(objectMapper.writeValueAsString(response))
                        }
                }
            }
            context("면접 예상 질문 생성에 실패하면") {
                every { resumeFacade.generateInterviewQuestion(any()) } throws CompletionFailedException()
                it("404를 반환한다.") {
                    sut.perform(
                        post("/resumes/interview-questions")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(request))
                    ).andDo { print() }
                        .andExpect {
                            status().isBadRequest
                        }
                }
            }
        }
    }
}
```













