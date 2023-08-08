---
title: "레디스에서 트랜잭션을 보장하는 방법"
date: 2023-08-08 09:29:00 +0900
aliases: 
tags: [Redis,Transaction]
categories: [Redis]
---

이전에 `multi`부터 `exec`까지의 명령어를 트랜잭션으로 하여금 명령어를 입력 순서대로 요청하는 트랜잭션 방식을 학습했었는데요.

레디스 트랜잭션에 대한 주의점과 보완점에 대해서 공유하고자합니다.

## 레디스에서 트랜잭션을 보장하는 방법

기본적으로 4가지 명령어가 있습니다.

1. multi: 트랜잭션을 시작하는 명령어, 이후의 명령은 queue에 저장됩니다.
2. discard: 트랜잭션 내에서 discard를 입력하면, 이전에 입력했던 명령을 모두 버립니다.
3. watch: 하나의 키에 대해서 낙관적 락을 걸어, 트랜잭션 도중 다른 커넥션에서 해당 키에 대해 변경을 주면, 트랜잭션 내의 명령어가 모두 실패합니다.
4. exec: 트랜잭션을 커밋합니다.

그리고 주의할 점으로는 다음과 같습니다.

1. 레디스의 트랜잭션 동안의 명령어 결과를 확인할 수 없다.
2. 트랜잭션 내부에서 문법 오류가 발생하면, 해당 트랜잭션은 Discard된다.
3. 자료구조를 잘못 사용할 경우, 트랜잭션에 영향을 주지 않는다.
4. watch를 사용하지 않으면, lock의 개념이 없기 떄문에 단순히 트랜잭션은 명령의 순차적인 보장이다.
5. rollback을 지원하지 않는다.

정도가 있습니다.

## @Transactional을 사용한 레디스 트랜잭션

우선, `@Transactional`을 통해 레디스 트랜잭션을 편리하게 사용하기 위해서는, redisTemplate에 옵션을 추가해야합니다.

```kotlin
@Configuration
class RedisConfig(
	private val redisProperties: RedisProperties
) {
	@Bean
    fun redisTemplate(objectMapper: ObjectMapper): RedisTemplate<String, Any> {
        val redisTemplate = RedisTemplate<String, Any>()
        redisTemplate.connectionFactory = redisConnectionFactory(redisStandaloneConfiguration())

        redisTemplate.keySerializer = StringRedisSerializer()
        redisTemplate.hashKeySerializer = StringRedisSerializer()
        redisTemplate.setEnableTransactionSupport(true) // transaction 허용

        return redisTemplate
    }
}
```

위와 같이, `setEnableTransactionSupport()`의 인자로 `true`를 넘겨주어야합니다.

그리고 테스트를 위한 서비스 클래스입니다.

```kotlin
@Service
@Transactional
class RedisService(
	private val redisTemplate: StringRedisTemplate
) {

	fun incr(key: String, isException:Boolean) {

	redisTemplate.opsForValue().increment(key)

	if(isException) {
		throw RuntimeException()
	}
	}

	fun incrAndNew(originKey: String, newKey: String, count: Int): Dto {
	redisTemplate.opsForValue().increment(originkey, count)

	val value = stringRedisTemplate.opsForValue().get(originKey)

	stringRedisTemplate.opsForValue().set(newKey,value)

	return Dto(newKey, value)
	}
}
```

`incr()` 함수는 키에 대해서 값을 1만큼 증가시키는 로직이기 때문에 `isException`을 true로 넘기지 않으면 성공하는 로직입니다.

그러나 `incrAndGet`의 경우에는 실패합니다.

위에서 언급했던, 
트랜잭션 내부에서 값을 조회해서 사용할 경우가 문제가 되는 것인데요.

테스트를 통해 확인해보겠습니다.

```kotlin
"incr 메서드를 실행하면, 2가 반환된다." {
	redisService.incr(ORIGIN_KEY, false)

	val value = redisTemplate.opsForValue().get(ORIGIN_KEY)

	value shouldbe "2"
}
```

위 메서드는 정상적으로 실행됩니다.

ORIGIN_KEY의 value에 대해서 1만큼 증가시키고, 증가한 값을 다시 조회해서 2인지 확인하기 때문입니다.

다음 테스트를 해보겠습니다.

```kotlin
"트랜잭션 내에서 예외가 발생하면 discard된다." {
	assertThatThrownBy(() -> redisService.incr(ORIGIN_KEY, true)).isInstanceOf(RuntimeException.class)

	val value = redisTemplage.opsForValue().get(key)

	value shouldBe "1"
}
```

기존의 `incr()` 메서드는 인자로 받은 key의 value에 대해서 1만큼 증가시키고 두번째 인자가 true일 경우 예외를 발생시키는데요.

위 테스트에서는 incr()메서드가 실행되었지만, value가 그래도 1인 것을 확인할 수 있습니다.

예상대로면 1이 증가하고 2가 된 상태에서 예외가 발생해야하는데, 트랜잭션 내에서 실패했기 때문에 모든 명령이 discard 된 것입니다.

이처럼, Redis에서 트랜잭션 내에서 예외가 발생할 경우, 이전의 모든 명령어들에 대해서 discard 시키는 것을 확인할 수 있습니다.

다음은 `incrAndNew()`메서드를 테스트해보겠습니다.






![opsget](/assets/img/2023-08-08-redis-transaction/opsget.webp)






