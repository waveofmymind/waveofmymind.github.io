---

title: "지속 성장 가능한 코드 리팩토링"
date: 2023-10-24 09:29:00 +0900
aliases: 
tags: [Kotlin,Spring]
categories: [Spring]

---

시중에는 많은 좋은 책들이 있다.

많은 사람들에게 언급되어진 '클린 코드'부터, 개인적으로 읽고 코드를 작성하는데 좋은 영감을 준 [내 코드가 그렇게 이상한가요?](https://www.yes24.com/Product/Goods/119287779)가 나에겐 그렇다.

![My Code is Strange?](/assets/img/2023-10-24-sustainable-software/book1.webp)

나는 남들과 마찬가지로 Java, Spring을 사용하는데 거리낌 없이 사용해왔고, 그때문에 다른 프레임워크나 언어를 사용할 필요성 또한 느끼지 못했다.

개념조차 그렇다.

언어적인 개념부터, 프레임워크의 특성, 예를 들어 ApplicationContext가 어떤 역할을 하는지 등에 대해서는 시중에 강의, 많은 글들을 접하며 익숙해지려고 노력했다.

그러나 최근들어 실제 팀 프로젝트나 개인 프로젝트를 진행하며, 내가 정의한 요구사항 명세에 대해서 어떻게 코드를 작성해 나가야하는 지에 대해서 고민이 생겼다.

특히 팀 프로젝트에서는 같은 백엔드라도 담당하는 영역이 다르다보니, 비즈니스 로직을 문서보다 코드를 통해 이해시키는 것이 효율적이라고 생각했다.(그 팀원도 백엔드 개발자일 가능성이 높기 때문이다.)

그래서 내가 작성하는 코드가 이 프로젝트가 잊혀져 갈 때 쯤의 내가 보았을 때에도, 팀 프로젝트를 진행하며 타인에게 비즈니스 로직의 설명을 할 때에도 명확한 흐름이 보이는 코드를 작성하는 것에 대한 열망이 생겼다.  

즉, 미래에도 지속이 가능하고 확장에도 용이한, 지속 성장이 가능한 코드를 작성하는 것에 목표가 생긴 것이다.

그래서 이번 기회에 내 기존 코드를 리팩토링 하는 시간을 가지고자 했다.

![refactoring](/assets/img/2023-10-24-sustainable-software/refactoring.webp)


## **AS-IS**

내 프로젝트의 핵심 비즈니스 로직의 코드는 파사드 패턴을 적용한 클래스이다.

처음에는 면접 예상 질문을 생성하는 로직에서 점차 다양한 흐름이 추가되었고,

이에 따라 컨트롤러 계층에서 다양한 클래스를 의존하게되다보니 이를 하나로 묶어버릴 수 있도록 파사드 계층을 하나 추가했다.

```kotlin

@Facade
class InterviewQuestionFacade(
    private val promptService: PromptService,
    private val openAiService: OpenAiService,
    private val openAiMapper: OpenAiMapper,
    private val predictionFacade: PredictionFacade,
    private val userRequestLogWriter: UserRequestLogWriter
) {
    suspend fun generateInterviewQuestions(commands: List<InterviewQuestionCommand>): List<InterviewQuestion> {
        return coroutineScope {
  
            val deferreds = commands.map { command ->
                async(Dispatchers.Default) {
                    generateInterviewQuestion(command)
                }
            }
            deferreds.awaitAll()
                .flatten()
        }
    }

    fun generateInterviewQuestion(command: InterviewQuestionCommand): List<InterviewQuestion> {
        val promptResponse = promptService.getPrompt(PromptType.INTERVIEW_QUESTION)
        val completionRequest = prepareCompletionRequest(command, promptResponse)

        val completionResult =
            loggingStopWatch { requestChatCompletion(completionRequest, command.userId, command.content) }

        userRequestLogWriter.saveUserRequestLog(command.toSaveLogCommand())

        predictionFacade.savePrediction(openAiMapper.completionToSavePredictionCommand(command, completionResult))

        return completionResult
    }

    private fun prepareCompletionRequest(
        command: InterviewQuestionCommand,
        promptResponse: PromptResponse
    ): ChatCompletionRequest {
        // ...
    }

    private fun requestChatCompletion(
        completionRequest: ChatCompletionRequest,
        userId: Long,
        userContent: String
    ): List<InterviewQuestion> {
        // ...
    }

    companion object {
        private const val PROMPT_LANGUAGE = "korean"
    }
}
```
private 메서드로 분리했음에도 코드가 길다.

generateInterviewQuestions에서 인자로 받은 commands를 이용해서 병렬적으로 generateInterviewQuestion을 수행하고, 이를 취합해서 결과를 내보낸다.

그리고 generateInterviewQuestion()을 자세히 보면,

```kotlin
fun generateInterviewQuestion(command: InterviewQuestionCommand): List<InterviewQuestion> {
        val promptResponse = promptService.getPrompt(PromptType.INTERVIEW_QUESTION)
        val completionRequest = prepareCompletionRequest(command, promptResponse)

        val completionResult =
            loggingStopWatch { requestChatCompletion(completionRequest, command.userId, command.content) }

        userRequestLogWriter.saveUserRequestLog(command.toSaveLogCommand())

        predictionFacade.savePrediction(openAiMapper.completionToSavePredictionCommand(command, completionResult))

        return completionResult
    }

private fun prepareCompletionRequest(
        command: InterviewQuestionCommand,
        promptResponse: PromptResponse
    ): ChatCompletionRequest {
        val completionRequestForm = command.toRequestForm(promptResponse, PROMPT_LANGUAGE)
        return openAiMapper.promptAndContentToChatCompletionRequest(completionRequestForm, command.content)
    }

private fun requestChatCompletion(
    completionRequest: ChatCompletionRequest,
    userId: Long,
    userContent: String
): List<InterviewQuestion> {
    try {
        val completionResult = openAiService.requestChatCompletion(completionRequest)
        return openAiMapper.completionToInterviewQuestionResponse(
            completionResult
        )
    } catch (e: FeignClientException) {
        logger.error(e.message, e)
        throw CompletionFailedException(
            userId = userId,
            userContent = userContent
        )
    }
}
```

언뜻 보면 이해하기 쉬워보이지만, generateInterviewQuestion()에 있는 private 메서드는 그렇게 단순하지 않다.

try-catch를 사용해서 요청에 대한 예외를 핸들링해서 커스텀 예외를 던지게 하는 로직이다.

그렇기 때문에 InterviewQuestionFacade는 퍼사드라는 이름 아래에서 매우 다양한 책임을 가지고 있었다.

왜냐하면 '퍼사드니까 이런 로직을 추가해도 괜찮겠지?' 라는 생각으로 하나씩 기능을 추가하게 되었기 때문이다.

그래서 이를 하나씩 개선해보고자 한다.

## **try-catch를 비즈니스 로직에서 감춘다.**

private 메서드는 테스트 할 수도 없고, 네트워크 요청에서 발생한 예외를 면접 예상 질문을 생성하는 클래스에서 핸들링하고 있다는 것이 불편했다.

OpenAiService에 위 로직을 추가하는 것은, OpenAi에 HTTP 통신을 하고 있는 클래스에 결과를 바인딩하는 로직과 try-catch 로직까지 추가되는 것이 적절하지 않다고 생각했다.

그래서 **`ChatCompletionReader`**라는 한 계층을 더 생성했다.

```kotlin
@Component
class ChatCompletionReader(
    private val openAiService: OpenAiService,
    private val openAiMapper: OpenAiMapper,
    private val userRequestLogPublisher: UserRequestLogPublisher
) {

    fun readChatCompletion(
        command: InterviewQuestionCommand,
        promptResponse: PromptResponse
    ): List<InterviewQuestion> {
        val completionRequest = prepareCompletionRequest(command, promptResponse, command.language)
        return requestChatCompletion(completionRequest, command.userId, command.content)
    }

    private fun prepareCompletionRequest(
        command: InterviewQuestionCommand,
        promptResponse: PromptResponse,
        promptLanguage: String
    ): ChatCompletionRequest {
        val completionRequestForm = command.toRequestForm(promptResponse, promptLanguage)
        return openAiMapper.promptAndContentToChatCompletionRequest(completionRequestForm, command.content)
    }

    private fun requestChatCompletion(
        completionRequest: ChatCompletionRequest,
        userId: Long,
        userContent: String
    ): List<InterviewQuestion> {
        return try {
            val completionResult = openAiService.requestChatCompletion(completionRequest)
            openAiMapper.completionToInterviewQuestionResponse(
                completionResult
            )
        } catch (e: Exception) {
			logger.error(e.message, e)
        	throw CompletionFailedException(
            userId = userId,
            userContent = userContent
            )
        }
    }
}
```
이제 InterviewQuestionFacade에서 많이 의존하던 클래스를 줄일 수 있고, 단지 readChatCompletion으로 '면접 예상 질문 생성을 요청한다'라는 것만 알면 된다.

```kotlin
fun generateInterviewQuestion(command: InterviewQuestionCommand): List<InterviewQuestion> {
        val promptResponse = promptService.getPrompt(PromptType.INTERVIEW_QUESTION)

        val completionResult = loggingStopWatch {
        	chatCompletionReader.readChatCompletion(command, promptResponse)
        }

        userRequestLogWriter.saveUserRequestLog(command.toSaveLogCommand())

        predictionFacade.savePrediction(openAiMapper.completionToSavePredictionCommand(command, completionResult))

        return completionResult
	}
```
제법 가벼워진 것 같지만 다음 단계가 남아있다.

## **로그 저장 변경**

InterviewQuestionFacade에서 굳이 성공 로그를 저장하는 로직을 수행해야 할까? 라는 고민이 들었다.

로직의 성공/실패 여부는 ChatCompletion의 응답 결과에 따라 나뉘기 때문에, 이는 ChatCompletionReader에서 이루어지는 것이 더 낫다는 생각이 들었다.

그래서, 이를 ChatCompletionReader에서 저장하도록 변경해 주었다.

```kotlin
@Component
class ChatCompletionReader(
    private val openAiService: OpenAiService,
    private val openAiMapper: OpenAiMapper,
    private val userRequestLogPublisher: UserRequestLogPublisher
) {

    fun readChatCompletion(
        command: InterviewQuestionCommand,
        promptResponse: PromptResponse
    ): List<InterviewQuestion> {
        val completionRequest = prepareCompletionRequest(command, promptResponse, command.language)
        return requestChatCompletionToOpenAi(completionRequest, command.userId, command.content)
    }

    private fun prepareCompletionRequest(
        command: InterviewQuestionCommand,
        promptResponse: PromptResponse,
        promptLanguage: String
    ): ChatCompletionRequest {
        val completionRequestForm = command.toRequestForm(promptResponse, promptLanguage)
        return openAiMapper.promptAndContentToChatCompletionRequest(completionRequestForm, command.content)
    }

    private fun requestChatCompletionToOpenAi(
        completionRequest: ChatCompletionRequest,
        userId: Long,
        userContent: String
    ): List<InterviewQuestion> {
        var outcome: RequestOutcome
        var result: List<InterviewQuestion>

        try {
            val completionResult = openAiService.requestChatCompletion(completionRequest)
            result = openAiMapper.completionToInterviewQuestionResponse(completionResult)
            outcome = RequestOutcome.SUCCESS
        } catch (e: Exception) {
            result = emptyList()
            outcome = RequestOutcome.FAILED
        }

        userRequestLogPublisher.publish(
            UserRequestLogEvent(
                userId = userId,
                userContent = userContent,
                requestOutcome = outcome
            )
        )

        return result
    }
}
```
동시에 로그를 저장하려고 할 때, **요청이 하나만 수행되는 문제**가 있어서 Spring Event를 사용해서 로그 저장을 이벤트로 발행하고 리스너에서 처리하여 순차적으로 DB에 저장할 수 있도록 변경했는데, 이는 추후 포스팅할 계획이다.

이제 ChatCompletionReader에서 외부 API를 이용하는 로직의 성공/실패에 따라 이벤트를 발행하면 된다.

다시 InterivewQuestionFacade의 generateInterviewQuestion()으로 돌아가보면, 로그를 저장하는 책임은 더이상 갖지 않는다.

```kotlin
fun generateInterviewQuestion(command: InterviewQuestionCommand): List<InterviewQuestion> {
        val promptResponse = promptService.getPrompt(PromptType.INTERVIEW_QUESTION)

        val completionResult = loggingStopWatch { chatCompletionReader.readChatCompletion(command, promptResponse) }

        if (completionResult.isNotEmpty()) {
            predictionFacade.savePrediction(PredictionMapper.completionToSavePredictionCommand(command, completionResult))
        }

        return completionResult
    }
```

> if문이 추가된 것은, 요청이 둘 중 하나만 성공하더라도 결과를 내려줄 때, 실패한 로직이 빈 배열로 넘어오게 되었을 때에도 DB에 저장하는 문제가 있었다. 이를 방지하기 위해 추가했다.

## **회고**

팀 프로젝트에서 작성하는 코드이기 때문에, 미래에는 사용되지 않을지도 모르고, 내가 아닌 다른 사람이 유지보수를 할 일도 없을 것이라고 생각한다.

그렇지만 미리 이런 고민들을 하며 코드를 개선한 경험을 소중히 가져가고 싶다.

미래에 어떤 회사의 개발자가 되어서도, 그 회사가 10년 후에도 내가 작성했던 코드로 서비스를 운영하고 있는 것은 되게 뿌듯한 경험일 것 같다.

또한 미래에 내 깃허브의 프로젝트를 보고 정보를 얻어가려는 익명의 개발자들에게도 좋은 코드에 대한 귀감이 되었으면 좋겠다.

아직은 많이 부족한 코드이고, 앞으로도 개선해나갈 여지가 충분하지만 일주일 동안 많은 생각을 하게 된 것 같다.






















