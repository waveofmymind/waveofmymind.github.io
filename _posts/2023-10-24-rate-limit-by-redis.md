---

title: "더블 클릭 요청 방지하기 - RateLimiter"
date: 2023-10-26 09:29:00 +0900
aliases: 
tags: [Redis,Spring]
categories: [Redis]

---

레주마블 프로젝트를 개발하면서 발생한 문제와 트러블 슈팅을 공유하고자합니다.

## **문제 상황**

레주마블 프로젝트의 핵심 서비스인 면접 예상 질문 생성은 다음과 같이 사용자 이력서와 각종 정보를 입력한 후, 결과 생성 버튼으로 백엔드 서버에 요청하게 됩니다.

![problem](/assets/img/2023-10-26-rate-limit-by-redis/process.webp)

그러나 이때, 짧은 순간에 더블 클릭시 요청이 두번 가는 문제가 발생했는데요.

사용자는 한 요청만 응답받게 되지만, 실제 서버에는 요청이 두번 나가기 때문에 DB에도 같은 내용이 두 번 저장됩니다.

이는 마이페이지에서 사용자가 같은 데이터를 중복으로 볼 수 있기 때문에 사용성을 저하시킬 수 있고, 서버에서의 중복 데이터를 삭제해야하기 때문에 추가적인 리소스가 필요합니다.

또한 저희 서버에서는 OpenAi의 API를 사용하는데, 이는 사용량만큼 과금이 되기 때문에 중복 요청에 대한 비용 증가 문제도 있습니다.

이러한 문제를 해결하고자, API 요청시 처리율 제한을 걸어 중복 요청을 막고자합니다.

## **처리율 제한 장치란?**

처리율 제한 장치는 트래픽의 처리율을 제한하기 위해 사용됩니다.

API 요청 횟수가 미리 정의된 임계치(ThreadHold)를 넘어서면 추가로 도달한 요청은 처리가 중단(Block)됩니다.

### **처리율 제한 장치의 위치**

이때 클라이언트 서버에서 요청을 막으면 되지 않는가? 라는 생각을 할 수 있지만,

위변조가 쉽기 때문에 안정적으로 처리율을 제한할 수 없다는 문제가 있습니다.

그리고 마이크로서비스 환경에서는 미들웨이(예를 들어 게이트 웨이)에 처리율 제한 장치를 두어 요청을 막기도 합니다.

### **어떤 알고리즘을 사용해야 하는가**

처리율 제한 장치를 구현하기 위한 알고리즘으로는 다음과 같습니다.

- 토큰 버킷
- 누출 버킷
- 고정 윈도 카운터
- 이동 윈도 로그
- 이동 윈도 카운터

**토큰 버킷**

간단하고 보편적으로 사용되는 알고리즘입니다.

1. 컨테이너에 지정된 개수의 토큰이 주기적으로 채워집니다.
2. 하나의 요청은 하나의 토큰을 처리하며, 토큰이 없는 경우 해당 요청은 버려집니다.

컨테이너는 구분하려는 요청마다 개수가 달라집니다.

예를 들어 IP마다 컨테이너가 필요하거나, 로직별로 컨테이너를 둘 수도 있습니다.

구현이 간단하지만 컨테이너가 토큰을 담을 수 있는 크기와 토큰을 어떤 주기마다 채울지를 튜닝해야합니다.

**누출 버킷**

큐로 구현하며, 큐가 가득 차 있을 경우 요청은 버려집니다.

큐의 크기만을 조정하기 때문에 메모리 사용량이 효율적이지만, 많은 트래픽이 올 경우 오래된 요청만 쌓이고 최신 요청은 다 버려질 수 있습니다.

**고정 윈도 카운터**

시간을 기준으로 윈도우를 만들고, 윈도우마다 카운터를 붙입니다.

요청마다 카운터의 값을 증가시키고, 임계치에 도달하면 시간이 지날때까지 버려집니다.

이는 윈도우의 경계 부근에서 요청이 임계치보다 많이 처리될 수 있는 문제가 있습니다.

**이동 윈도 로깅**

고정 윈도 카운터의 단점을 해결하기 위해서, 타임 스탬프를 기록하며 **들어온 요청 시간 - 정해진 시간** 내의 요청 개수를 체크해서 요청 처리 여부를 결정합니다.

**이동 윈도 카운터**

상기 두 알고리즘을 결합한 것으로, 직전 요청 수와 현재 1분간의 요청 수, 겹치는 비율을 통해 남은 요청의 비율을 계산해서 요청 처리 여부를 결정합니다.



저희 프로젝트는 분당 요청 횟수를 고려할만큼 많은 트래픽이 있지 않기 때문에 고정 윈도 카운터로도 충분히 문제를 해결할 수 있다고 생각해서 **고정 윈도 카운터**를 적용하고자 합니다.



## **어떤 방법으로 구현해야하는가**

처리율 제한 장치로 많이 사용하는 라이브러리는 buck4j로, 이름 그대로 토큰 버킷 알고리즘을 활용해서 처리율 제한을 구현할 수 있습니다.

그러나 새로운 기술을 학습하는 것보다, 현재 구현하기로 했던 고정 윈도 카운터의 경우는 사용중인 레디스로도 충분히 구현할 수 있기 때문에 Redis를 활용할 것입니다.

카운터를 Redis에 올려놓고, 임계치를 넘을 경우 429을 반환하도록 예외를 던져주고 이를 Advice에서 핸들링 할 것입니다.

### **유니크 키 만들기**

캐시에 올리기 위해서 key값을 잘 정해야합니다.

현재는 면접 예상 질문 API에 대한 처리율을 제한하기 위해 사용되지만 추후 확장성을 고려했을 때, 메서드 정보를 포함해서 구현하는 것이 좋습니다.

유저 정보로만 구성할 경우, 다음과 같은 문제점이 발생할 수 있기 때문입니다.

1. A라는 API를 위한 카운터
2. B라는 API를 위한 카운터

단순히 유저 정보로만 Key를 이용할 경우 API마다 카운터를 구성하는 것이 어렵기 때문에, 메서드 정보를 포함해야합니다.

### **기존 메서드에 어떻게 적용할까**

처리율 제한을 확인하는 로직은 다음과 같습니다.

1. 사용자 요청
2. 캐시에 카운터 여부 확인 -> 캐시에 존재할 경우 카운터 + 1이 임계치를 넘는지 확인
3. 요청 수행

위와 같은 로직은 RedisTemplate을 사용해서 이루어지지만, 이는 면접 예상 질문을 생성하는 로직에 포함되기 때문에, 책임이 많아진다는 문제가 있습니다.

비즈니스 로직을 사용하는데 있어서 처리율을 제한하는 것은 부가적인 로직이기 때문에 비즈니스 로직과의 결합은 좋지 않습니다.(그렇기 때문에 이전에 [리팩토링](https://waveofmymind.github.io/posts/sustainable-software/)을 경험했습니다.)

또한 추후 면접 예상 질문 외에도 다른 API 요청으로 처리율을 제한할 필요가 있을 때, 동일한 로직을 추가해야하기 때문에 중복 코드를 작성하게 됩니다.

이를 해결하기 위해서 AOP를 적용해보고자 합니다.

처리율 제한(RateLimiter)를 흩어진 관심사로 판단하고, AOP를 사용해서 JoinPoint를 요청 처리 전으로 설정하면, 메인 로직이 수행되기 전에 처리율 제한 로직이 먼저 수행되기 때문에 목적을 달성할 수 있습니다.

## **AOP를 활용한 적용기**

앞전에 유니크 키를 구성하기 위해서 메서드 정보를 포함하는게 좋다고 말씀드렸기에, AOP를 적용할 때 어노테이션 속성으로 해당 로직에 대한 유니크한 네임을 설정할 수 있도록 할 것입니다.

```kotlin
@Target(AnnotationTarget.TYPE, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class LimitRequestPerTime(
  
    val prefix: String = "",
  
    val ttl: Int = 1,

    val ttlTimeUnit: TimeUnit = TimeUnit.SECONDS,

    val count: Int = 1
)
```

각각의 인자로는

- prefix: 로직을 구분할 프리픽스
- ttl: 임계치에 도달한 요청을 얼마나 제한할 것인지(ttl이 지나면 해당 value가 지워져 카운터가 초기화되도록)
- Count: 임계치

로 이루어집니다.



위 어노테이션을 이용하면 사용하고 싶은 로직에 손쉽게 처리율 제한을 적용할 수 있습니다.



그리고 RateLimiter를 구현해야합니다.

```kotlin
interface RateLimiter {
    @Throws(Throwable::class)
    fun tryApiCall(key: String, limitRequestPerTime: LimitRequestPerTime, proceedingJoinPoint: ProceedingJoinPoint)
}

@Component("redisRateLimiter")
class RedisRateLimiter(
    private val redisTemplate: RedisTemplate<String, String>
) : RateLimiter {

    private val log = LoggerFactory.getLogger(this::class.java)

    override fun tryApiCall(
        key: String,
        limitRequestPerTime: LimitRequestPerTime,
        proceedingJoinPoint: ProceedingJoinPoint
    ) {
        val previousCount = redisTemplate.opsForValue().get(key)?.toInt() ?: 0

        if (previousCount >= limitRequestPerTime.count) {
            throw RequestPerSecondException()
        }

        redisTemplate.execute(object : SessionCallback<Any?> {
            override fun <K : Any?, V : Any?> execute(operations: RedisOperations<K, V>): Any {
                try {
                    operations.multi()
                    redisTemplate.opsForValue().increment(key)
                    redisTemplate.expire(key, limitRequestPerTime.ttl.toLong(), limitRequestPerTime.ttlTimeUnit)
                } catch (e: Exception) {
                    log.error(e.message, e)
                    operations.discard()
                    throw e
                }
                return operations.exec()
            }
        })
        proceedingJoinPoint.proceed()
    }
}
```

`RateLimiter`를 인터페이스로 만든 이유는, 추후 Redis를 사용하지 않고 bucket4j나 별도의 처리율 제한 장치를 구현할 수 있도록 하기 위함입니다.

그리고 이를 구현한 `RedisRateLimiter` 입니다.

tryApiCall에서는 인자로 받은 key값으로 카운터를 조회하고, 임계치가 넘었을 경우 예외를 반환시킵니다.

임계치에 도달하지 못했을 때에는 카운터를 1 증가시키고 카운터의 ttl도 증가시킵니다.

이 과정은 트랜잭션으로 묶여야 합니다. 왜냐하면

1. 카운터가 증가되고 ttl을 증가하는 로직이 수행되지 못하면 카운터가 만료되어 처리율 제한을 할 수 없게 될 것이고,

2. 카운터가 증가되지 못하고 ttl만 증가 되었다면 마찬가지로 임계치는 증가하지 않고, 증가하지 않는 카운터는 처리율 제한을 할 수 없다.

위와 같은 문제가 발생할 수 있기 때문입니다.

카운터 값을 변경했으면 인자로 받은 함수를 그대로 수행 시킵니다.

### **RateLimitAspect**

이제 Aspect를 정의합니다.

```kotlin
@Aspect
@Component
class RateLimiterAspect(
    @Qualifier("redisRateLimiter")
    private val rateLimiter: RateLimiter
) {
    @Around("execution(* resumarble.core.domain.resume.facade.*.*(..))")
    @Throws(Throwable::class)
    fun interceptor(joinPoint: ProceedingJoinPoint) {
        val limitRequestPerTime = getLimitRequestPerTimeAnnotationFromMethod(joinPoint)

        if (limitRequestPerTime == null) {
            joinPoint.proceed()
            return
        }

        val uniqueKey = getUniqueKeyFromMethodParameter(joinPoint)
        rateLimiter.tryApiCall(
            composeKeyWithUniqueKey(limitRequestPerTime.prefix, uniqueKey, "ApiCounter"),
            limitRequestPerTime,
            joinPoint
        )
    }

    private fun getLimitRequestPerTimeAnnotationFromMethod(joinPoint: ProceedingJoinPoint): LimitRequestPerTime? {
        val signature = joinPoint.signature as MethodSignature
        val method = signature.method
        return method.getAnnotation(LimitRequestPerTime::class.java)
    }

    private fun getUniqueKeyFromMethodParameter(joinPoint: ProceedingJoinPoint): Long {
        val parameters = joinPoint.args.toList()
        return parameters[0] as Long
    }

    private fun composeKeyWithUniqueKey(prefix: String, uniqueId: Long, suffix: String): String {
        return "$prefix:$uniqueId:$suffix"
    }
}
```

저는 resume 패키지의 비즈니스 로직을 담당하는 facade 패키지의 모든 클래스에 대해 포인트 컷을 적용했습니다.

적용하더라도, 로직에서 메서드에 `@LimitRequestPerTime`이 붙지 않는 경우에는 수행하지 않습니다.

그리고 유니크 키를 생성해야하는데, 제 메서드는 함수의 첫번째 인자로 userId를 받고 있기 때문에 parameters[0]은 userId 값이 됩니다.

이를 이용해서 캐시에 사용할 유니크 키를 생성해줍니다.

그리고 이제 아까 만들었던 RateLimiter의 tryApiCall()가 수행됩니다.

저는 아래와 같이 사용하고 있습니다.

```kotlin
@LimitRequestPerTime(prefix = "generateInterviewQuestions", ttl = 5, count = 2, ttlTimeUnit = TimeUnit.SECONDS)
    suspend fun generateInterviewQuestions(
        userId: Long,
        commands: List<InterviewQuestionCommand>
    ): List<InterviewQuestion> {
        return coroutineScope {
            val deferreds = commands.map { command ->
                async(Dispatchers.IO) {
                    generateInterviewQuestion(command)
                }
            }
            deferreds.awaitAll()
                .flatten()
        }
    }
```

더블 클릭 문제를 해결하기 위해서 임계치를 2로 설정하고, 해당 카운터는 5초동안 TTL을 유지합니다.

예를 들어 userId가 1인 경우, 카운터 키 값은 generateInterviewQuestions:userId:ApiCounter가 됩니다.

## **검증**

이제 카운터가 임계치에 도달하면 429 예외가 발생하는지 테스트해보겠습니다.

제가 설정한 값으로는 5초 내에 두번 이상 요청할 경우 첫번째 요청 외에는 429 예외가 발생해야합니다.











 
















## **레퍼런스**

- [가상 면접 사례로 배우는 대규모 시스템 설계 기초](https://www.yes24.com/Product/Goods/102819435)



