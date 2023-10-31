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

나는 남들과 마찬가지로 Java, Spring을 사용하는 것을 거리낌 없이 사용 했고, 다른 언어와 프레임워크를 사용한다는 선택지를 검토할 필요성을 느끼지 못했다.

개념조차 그렇다.

언어적인 개념부터, 프레임워크의 특성, 예를 들어 ApplicationContext가 어떤 역할을 하는지 등에 대해서는 시중에 강의, 많은 글들을 접하며 익숙해지려고 노력했다.

그러나 최근들어 실제 팀 프로젝트나 개인 프로젝트를 진행하며, 내가 정의한 요구사항 명세에 대해서 어떻게 코드를 작성해 나가야하는 지에 대해서 고민이 생겼다.

특히 팀 프로젝트에서는 같은 백엔드라도 담당하는 영역이 다르다보니, 비즈니스 로직을 문서보다 코드를 통해 이해시키는 것이 효율적이라고 생각했다.(그 팀원도 백엔드 개발자일 가능성이 높기 때문이다.)

그래서 내가 생각하는 지속 성장이 가능한 코드는 무엇일까?

## **좋은 코드 != 지속 성장 가능한 코드**

좋은 코드를 짜기 위해 많은 노력을 하곤 하지만, 정말 정답이 없는 것 같다.

그 당시에 좋은 코드라고 넘어갔던 설계를 그 후에 보았을 때에는 엉망 진창인 코드로 보일때가 많다.

또한 사람마다 겪은 경험이 다르기 때문에 코드를 짜는 스타일도 다를 것이며, A라는 사람이 짠 코드가 B에겐 좋은 코드로 보이더라도 C에겐 아닐 수 있다.

이전에 개발바닥의 [클린 코딩 하는데 구현을 못하는 개발자
](https://youtu.be/cyoUrxDVGXE?si=L8eag99vEwacTg7K)를 본 적이 있다.

이 영상에서는 클린 코드를 짜기 위해 너무 많은 시간을 투자하기 때문에 성과(구현)이 나오지 않는 사람에 대한 이야기가 나온다.

회사에 속한 개발자는 결국 코드로써 성과를 나타낼 수 있기 때문에 나는 먼저 완벽한 코드를 짜는 것 보다, 조금 부족하더라도 되는 코드를 짜는 것이 중요하다고 생각한다.

대신, 책임을 미래의 나에게 미루는 것이라고 생각한다.

기능이 추가되고, 요구사항이 변경되면 코드가 변경될 필요가 생기고, 복잡해질 것이다.

이를 리팩토링 해야하는 것은 나의 책임이기 때문에 미룰수록 악마를 키우는 일이 될 것이다.

그래서 좋은 코드를 작성하기 위해 성과가 안나오는 것보다, 차라리 미래의 내가 보더라도 한눈에 파악할 수 있고, 만약 다른 사람에게 리팩토링의 책임이 돌아가더라도 쉽게 이해할 수 있는 코드를 짜는 것이 좋지 않을까? 라는 생각을 하게 되었다.

그래서 내가 작성하는 코드가 이 프로젝트가 잊혀져 갈 때 쯤의 **미래의 내**가 보았을 때도, 팀 프로젝트를 진행하며 타인에게 비즈니스 로직의 설명을 할 때에도 **명확한 흐름이 보이는 코드(성장이 가능한)**를 작성하는 것에 대한 열망이 생겼다.

이것이 내가 생각하는 지속 성장이 가능한 코드라고 생각한다.

그래서 이번 기회에 내 기존 코드를 리팩토링을 하면서 다양한 생각을 하게 되었다.

![refactoring](/assets/img/2023-10-24-sustainable-software/refactoring.webp)


## **AS-IS**

추가 기능을 추가하면서, 리팩토링의 필요성을 느낀 클래스이다.

네이밍만 보아도 파사드 클래스임을 알 수 있지만, 다양한 클래스를 의존하고 있다.

원래 컨트롤러 계층에서 서비스 클래스를 너무 많이 의존하다보니, 기능을 확장할수록 서비스 클래스를 더 많이 사용하게 될 것이라는 생각이 들었다.

그래서 비즈니스 레이어에서 병목이 생기더라도, 컨트롤러 - 비즈니스 사이에는 의존성을 최대한 줄이는 것이 좋지 않을까 해서 적용하게 되었다.

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

그렇지만 이런 고민들을 하며 코드를 개선한 경험을 소중히 가져가고 싶다.

이런 고민을 쌓아가며 미래에 어떤 회사의 개발자가 되어서도, 그 회사가 10년 후에도 내가 작성했던 코드를 기반으로 서비스가 운영된다는 것은 그만큼 좋은 코드를 작성할 수 있는 개발자가 되었기 때문일 것이다.

아직은 많이 부족한 코드이지만, 일주일 동안 많은 생각을 하게 된 것 같다.






















