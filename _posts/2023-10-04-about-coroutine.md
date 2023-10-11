---

title: "코루틴을 사용한 트랜잭션 강결합 문제 트러블 슈팅"
date: 2023-10-04 09:29:00 +0900
aliases: 
tags: [Kotlin,coroutine,Spring]
categories: [Spring]

---

레주마블 프로젝트를 진행하면서 생성된 면접 예상 질문을 다루는 로직에서 코루틴을 사용한 경험을 공유하고자합니다.

## **문제 발생**

개발중인 레주마블 프로젝트의 면접 예상 질문 서비스는 다음과 같은 흐름으로 수행됩니다.

```
1. 클라이언트 요청
2. OpenAi API를 통해 ChatCompletion 요청
3. 결과 데이터를 DTO로 바인딩
4. 응답
```

비회원임에도 활용할 수 있도록 하기 위해 별도의 저장, 권한 인증 없이 구현하게 되었는데요.

그러던 중, 회원 서비스를 추가해서 회원이 면접 예상 질문 서비스를 사용하는 경우에는 DB에 자동 저장되어 추후 마이페이지에서 확인할 수 있도록 하면 좋겠다는 사안이 나왔습니다.

처음에는 단순히 위 흐름에 DB에 저장하는 로직을 추가했지만, 

DB에 저장하는 로직에서 예외가 발생할 경우 사용자가 결과 자체를 받아볼 수 없게 되는 문제가 발생했습니다.

이는 저장 로직에서 예외가 전파되어 면접 예상 질문 생성 자체가 실패하게 되버리는 것인데요.

결과는 생성되었으나 DB에 저장되지 못해서 사용자가 서비스를 이용하지 못하는 불편함이 있었습니다.

저는 이 문제의 원인으로 면접 예상 질문 서비스를 이용하는 기능과 예상 질문을 저장하는 기능이 강하게 결합되어 있기 때문이라고 판단했습니다.

그래서 저는 다음과 같은 해결 목표를 세웠습니다.

```
AS-IS: 면접 예상 질문 서비스가 DB 저장 로직에 영향을 받아 문제를 발생시킨다.
HOW: 하나의 트랜잭션에서 수행되어 각각 별도의 트랜잭션으로 분리한다.
WHAT: DB 저장 로직이 실패하더라도 면접 예상 질문 서비스는 이용할 수 있어야한다.
```

## **AS-IS**

현재 면접 예상 질문을 생성하는 메서드는 아래와 같습니다.

```kotlin
@Transactional
fun generateInterviewQuestion(command: InterviewQuestionCommand): InterviewQuestionResponse {
	val prompt = promptReader.getPrompt(command.promptType)

	val completionRequest = preparedCompletionRequest(command, prompt)

	predictionWriter.savePrediction(openAiMapper.convertToCommand(command, completionResult))

	return requestChatCompletion(completionRequest)
}

private fun requestChatCompletion(completionRequest: ChatCompletionRequest): InterviewQuestionResponse {
        return openAiMapper.completionToInterviewQuestionResponse(
            openAiService.requestChatCompletion(completionRequest)
        )
    }
```

정리하면,
1. 면접 예상 질문에 따른 프롬프트 조회
2. 조회한 프롬프트로 ChatCompletion을 요청하기 위한 List 생성
3. OpenAiService를 통해 ChatCompletion을 요청하고, 응답으로 예상 질문 반환
4. 면접 예상 질문 저장
5. 응답

이 로직이 하나의 트랜잭션으로 엮여있기 때문에 다양한 문제점이 발생하고 있습니다.

예상 되는 문제 지점으로는 다음과 같았습니다.

1. OpenAiService는 ChatCompletion을 요청할 때 네트워크를 타기 때문에 네트워크 문제로 예외가 발생할 여지가 있음
2. savePrediction을 통한 DB 저장이 문제가 발생할 경우 예외가 전파되고, 이에 따라 generateInterviewQuestion()이 실패함

이를 개선하고자, 외부 API에 대한 호출을 트랜잭션 밖으로 빼고, 예상 질문이 생성되었다면 사용자는 내용이 저장되지 않더라도 결과를 확인할 수 있도록 강한 결합을 제거하는 것이 중요하다고 생각했습니다.

## 트랜잭션 전파 옵션 사용하기

가장 먼저 떠오른 방법입니다.

savePrediction()의 경우 별도의 트랜잭션으로 분리해서 부모 트랜잭션이 영향을 받지 않게 하는 것입니다.

`@Transactional`의 기본 옵션은 `REQUIRED`로, 부모 트랜잭션이 존재하면 부모 트랜잭션으로 묶이고, 부모 트랜잭션이 없을 경우에만 새로운 트랜잭션을 생성합니다.

이를 `REQUIRES_NEW` 옵션으로 변경하여 항상 새로운 트랜잭션이 생성되게 하면 되지 않을까라는 생각을 했습니다.

그래서 아래와 같이 `REQUIRES_NEW`옵션을 주고, 테스트를 위해 예외를 던지는 로직으로 변경했습니다.

```kotlin
@Transactional(propagation = Propagation.REQUIRES_NEW)
fun savePrediction(command: SavePredictionCommand) {
	throw IllegalArgumentException()
}
```

```kotlin
@Test
fun test() {
	val request = InterviewQuestionRequestFixture()
	shouldNotThrowAny {
		interviewQuestionFacade.generateInterviewQuestion(request)

	}
}
```

이제 위 테스트는 savePrediction()이 별도의 트랜잭션에서 동작하기 때문에 generateInterviewQuestion()에 영향을 주지 않고 테스트는 성공해야합니다.

그러나 테스트는 실패했습니다.

![test-exception](/assets/img/2023-10-04-about-coroutine/test-exception.webp)

generateInterviewQuestion()과 savePrediction()가 각각 실행될 때 새로운 트랜잭션을 얻었지만, `IllegalArgumentException`으로 트랜잭션이 롤백되었습니다.

이를 통해 트랜잭션을 분리하더라도 예외가 전파되어 부모 메서드도 실패한다는 것을 알았습니다.

이는 아래처럼 try-catch로 발생할 수 있는 예외를 잡는다면 부모 트랜잭션이 롤백되는 것을 방지할 수 있습니다.

```kotlin
@Transactional
    public void generateInterviewQuestion(String request) {
        try {
            predictionWriter.savePrediction(request);
        } catch (
                IllegalArgumentException e) {
            log.info("예외가 잡혔습니다.");
        }
    }
```

![test-exception2](/assets/img/2023-10-04-about-coroutine/test-exception2.webp)

위처럼 predictionWriter의 트랜잭션만 예외가 발생하고 부모 트랜잭션에서는 예외가 발생하지 않았습니다.

그러나 이는 예상 질문을 생성하는 로직에서 예상 질문을 다시 저장하고, 이에 대한 예외를 잡는 책임까지 갖게 되었습니다.

또한 이는 추후 발생한 문제이지만, 예상 질문을 저장하는 로직 이후에 새로운 로직을 추가하는 경우가 문제가 됩니다.

추가된 로직에서 예외가 발생하면 부모 로직에서 실패해야한다고 가정했을 때, 이미 예상 질문은 저장되었지만 사용자는 결과를 확인할 수 없는 문제가 있습니다.

## **TO-BE**

이를 해결하기 위해 트랜잭션의 범위를 좁히고 Prediction에 저장하는 것을 코루틴을 이용하여 비동기적으로 처리하고자 했습니다.

코루틴을 활용하면 예상 질문을 생성해서 사용자는 결과를 확인할 수 있으며, 비동기적으로 트랜잭션을 생성해서 DB에 저장합니다.

또한 예외가 발생할 경우 CoroutineExceptionHandler를 통해 예외가 전파되지 않고 손쉽게 핸들링 할 수 있습니다.

다음과 같이 구현할 수 있었습니다.

```kotlin
fun generateInterviewQuestion(command: InterviewQuestionCommand): InterviewQuestionResponse {
        val completionResult = loggingStopWatch {
            val promptResponse = promptService.getPrompt(PromptType.INTERVIEW_QUESTION)
            val completionRequest = prepareCompletionRequest(command, promptResponse)
            requestChatCompletion(completionRequest)
        }

        predictionFacade.savePrediction(openAiMapper.completionToSavePredictionCommand(command, completionResult))

        return completionResult
    }
// ...

@Facade
class PredictionFacade(
    private val savePredictionUseCase: SavePredictionUseCase
) {
    private val scope = CoroutineScope(Dispatchers.IO)

    fun savePrediction(command: SavePredictionCommand) {
        scope.launch(handler) {
            savePredictionUseCase.savePrediction(command.toDomain())
        }
    }

    val handler = CoroutineExceptionHandler { _, throwable ->
        loggingErrorMarking {
            SAVE_PREDICTION_ERROR_MESSAGE + "${throwable.message}"
        }
    }

    @PreDestroy
    fun cleanUp() {
        scope.cancel()
    }

    companion object {
        private const val SAVE_PREDICTION_ERROR_MESSAGE = "면접 예상 질문 저장이 실패했습니다. 예외 메시지: "
    }
}
```

주의할 점은 `@Transactional`의 위치입니다.

`@Transactional`은 스레드에 종속적이여서 코루틴의 경우 한단계 및의 경량 스레드 수준이기때문에 윗 스레드를 옮겨다닐 수 있습니다.

이러한 점에서 트랜잭션 컨텍스트를 유지하는 것이 어려워질 수 있습니다.

저는 그래서 savePrediction()에서 트랜잭션을 걸지 않고, 한단계 더 내려가서 
SavePredictionUseCase의 메서드에 `@Transactional`을 사용했습니다.

그리고 이제 generateInterviewQuestion()에서 외부 API를 타는 ChatCompletion을 요청하는 로직이 트랜잭션 범위의 밖에 있기 때문에 트랜잭션 내에 네트워크를 타지 않게 되었습니다.

**작성중**


















