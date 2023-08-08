---
title: "레디스에서 트랜잭션을 보장하는 방법"
date: 2023-08-05 09:29:00 +0900
aliases: 
tags: [Redis,Transaction]
categories: [Redis]
---

이전에 `multi`부터 `exec`까지의 명령어를 트랜잭션으로 하여금 명령어를 입력 순서대로 요청하는 트랜잭션 방식을 학습했었는데요.

레디스 트랜잭션에 대한 주의점과 발생한 문제를 해결하기 위한 LuaScript의 사용,
그리고 파이프라인에 대해서 공유하고자합니다.

## **레디스에서 트랜잭션을 보장하는 방법**

기본적으로 4가지 명령어가 있습니다.

1. **multi**: 트랜잭션을 시작하는 명령어, 이후의 명령은 queue에 저장됩니다.
2. **discard**: 트랜잭션 내에서 discard를 입력하면, 이전에 입력했던 명령을 모두 버립니다.
3. **watch**: 하나의 키에 대해서 낙관적 락을 걸어, 트랜잭션 도중 다른 커넥션에서 해당 키에 대해 변경을 주면, 트랜잭션 내의 명령어가 모두 실패합니다.
4. **exec**: 트랜잭션을 커밋합니다.

그리고 주의할 점으로는 다음과 같습니다.

1. 레디스의 트랜잭션 동안의 명령어 결과를 확인할 수 없다.
2. 트랜잭션 내부에서 문법 오류가 발생하면, 해당 트랜잭션은 Discard된다.
3. 자료구조를 잘못 사용할 경우, 트랜잭션에 영향을 주지 않는다.
4. watch를 사용하지 않으면, lock의 개념이 없기 떄문에 단순히 트랜잭션은 명령의 순차적인 보장이다.
5. rollback을 지원하지 않는다.

정도가 있습니다.

## **@Transactional을 사용한 레디스 트랜잭션**

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

	val value = redisTemplage.opsForValue().get(ORIGIN_KEY)

	value shouldBe "1"
}
```

기존의 `incr()` 메서드는 인자로 받은 key의 value에 대해서 1만큼 증가시키고 두번째 인자가 true일 경우 예외를 발생시키는데요.

위 테스트에서는 incr()메서드가 실행되었지만, value가 그래도 1인 것을 확인할 수 있습니다.

예상대로면 1이 증가하고 2가 된 상태에서 예외가 발생해야하는데, 트랜잭션 내에서 실패했기 때문에 모든 명령이 discard 된 것입니다.

이처럼, Redis에서 트랜잭션 내에서 예외가 발생할 경우, 이전의 모든 명령어들에 대해서 discard 시키는 것을 확인할 수 있습니다.

다음은 `incrAndNew()`메서드를 테스트해보겠습니다.
`ORIGIN_KEY`의 `value`를 조회하고 2만큼 증가시켜서 `NEW_KEY`에 대한 value로 저장하는 로직입니다.

```
"트랜잭션 내에서 값을 조회후 변경할 경우 discard된다." {
	assertThatThrownBy(() -> redisService.incrAndNew(ORIGIN_KEY,NEW_KEY,2)).isInstanceOf(IllegalArgumentException.class)

	val value = redisTemplate.opsForValue().get(ORIGIN_KEY)
	
	value shouldBe "1"
}
```

그러나 위처럼 새로운 키에 대해 저장이 되지 않고,

예외를 발생시키게 되며, incAndNew() 메서드 로직에 count만큼 증가시키는 것도 롤백이 된 것을 확인할 수 있습니다.

![opsget](/assets/img/2023-08-05-redis-transaction/opsget.webp)

실제로 `opsForValue().get(key)`를 보면, 파이프라인이나 트랜잭션 상황에서는 null을 반환하는 것을 알려주고 있습니다.

그렇기 때문에 트랜잭션 내부에서 메서드 로직 내에서 조회후, 데이터를 다룰 수 없습니다.

이를 해결하기 위해 LuaScript를 사용할 수 있습니다.

## **LuaScript**

레디스 실행엔진 내부의 Lua 인터프리터를 활용해서 script를 실행할 수 있습니다.

script에서 값을 체크할 수 있기 때문에 다른 명령어에 활용 또한 가능합니다.

그리고 가장 중요한 장점인, 원자성을 보장합니다. 때문에 동시성 문제에 대해서 안전합니다.

사용하기 위해서 .lua 확장자로 script 파일을 작성합니다.

### luaScript 작성

**incr.lua**
```
redis.call("INCR", KEYS[1])
```
**incrAndNew.lua**
```
redis.call("INCRBY', KEYS[1], ARGV[1])
local value = redis.call('GET', KEYS[1])
redis.call('SET', KEYS[1], value)
return value
```

- `INCRBY`는 지정한 값 만큼 증가하는 것이고, `INCR`은 1만큼 증가합니다.
### Bean으로 등록하기

```kotlin
@Bean
fun RedisScript<String> IncrAndNewScript() {
	Resource script = ClassPathResource("/scripts/incrAndNew.lua")

	return RedisScript.of(script, String.class)
}

@Bean
fun RedisScript<Unit> IncrScript() {
	Resource script = ClassPathResource("/scripts/incr.lua")

	return RedisScript.of(script)
}
```

### RedisScript 활용하기

```kotlin
@Service
class RedisService(
	private val redisTemplate: StringRedisTemplate,
	private val incrAndNewScript: RedisScript<String> incrAndNewScript,
	private val RedisScript<Unit> incrScript
) {
	fun incr(key: String, isException: Boolean) {
		redisTemplate.excute(incrScript, immutableListOf(key))
		if (isException) {
			throw RuntimeException()
		}
	}

	fun incrAndNew(originKey: String, newKey: String, count: Int): Dto {
		val value = redisTemplate.excute(incrAndNewScript, immutableListOf(originKey, newKey), String.valueOf(count))

		return Dto(newKey, value)
	}
}
```

이전에 실행했던 로직과 동일하지만 이번에는 incrAndCopy() 메서드가 정상적으로 실행됩니다.

또한 이제 incr 메서드에서 값이 증가 후 예외가 발생해서 discard 되었던 것도 갓이 rollback되지 않게됩니다.

```kotlin
"incr 함수에서 예외가 발생할 경우에도 value는 2이다." {
	assertThatThrownBy(() -> redisService.incr(ORIGIN_KEY, true)).isInstanceOf(RuntimeException.class)

	val value = redisTemplate.opsForValue().get(ORIGIN_KEY)
	value shouldBe "2"
}

"예외가 발생하지 않으면 NEW_KEY의 value는 3이다." {
	val dto = redisService.incrAndNew(ORIGIN_KEY, NEW_KEY, 2)
	val value = redisTemplate.
	dto.value shouldBe "3"
	dto.newKey shouldBe "NEW_KEY"

	val originValue = redisTemplate.opsForValue().get(ORIGIN_KEY)
	originValue shouldBe "3"
}
```

트랜잭션을 사용하지 않기 때문에 예외가 발생해도 discard 되지 않아 데이터가 변경됩니다.

이 경우에 다시 `@Transactional`을 사용할 경우 discard 됩니다.(트랜잭션에서 LuaScript를 사용할 수 있습니다.)

Redis는 싱글 스레드로 동작하기 때문에 병렬적인 요청에 대한 동시성 문제는 발생하지 않지만, 명령 순서에 따른 동시성 문제는 발생할 수 있습니다.

LuaScript를 사용하면 Atomic을 보장하기 때문에 동시성 문제를 해결할 수 있습니다.

## 레디스 파이프라이닝

스프링 서버와 Redis 서버는 TCP 기반의 네트워크 통신을 하게 되는데,

명령 호출시 개별적으로 네트워크 통신을 하게 되면 read,write를 여러번 수행해야합니다.

즉 RTT가 순차적으로 증가하게 됩니다.

이러한 점을 개선하고자 레디스에서는 파이프라인을 구축하여 요청을 한꺼번에 보내고, 한번에 받는 것을 지원하고 있습니다.

![pipeline](/assets/img/2023-08-05-redis-transaction/pipeline.webp)

Spring Data Redis를 사용하는 경우, RedisTemplate에서 함수로 지원하고 있습니다.

![executePipelined](/assets/img/2023-08-05-redis-transaction/executePipelined.webp)

그러나 이는, sessionCallback 방식으로 사용되며,

트랜잭션과 마찬가지로 로직 내에서의 조회 값을 다룰 수 없습니다.

사용하게 된다면, 다수의 명령어를 실행할 때, 파이프라인을 통해서 요청을 한꺼번에 보낸다면, 성능상 이점을 가져갈 수 있을 것 같습니다.

## 레퍼런스

- [Redis 공식 문서](https://redis.io/docs)
- [Atomicy with Lua](https://developer.redis.com/develop/java/spring/rate-limiting/fixed-window/reactive-lua/)
- [Spring Data Redis](https://docs.spring.io/spring-data-redis/docs/current/reference/html/#redis)










