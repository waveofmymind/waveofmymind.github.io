---
title: "분산락이 가지는 문제점과 보완 방법"
date: 2023-09-27 00:29:00 +0900
aliases: 
tags: [Distributed Lock,DB Lock]
categories: [Spring]
---

이전에 분산락을 구현하기 위해 레디스를 사용했습니다.

레디스는 스프링 서버와 통신을 할 경우 TCP/IP 기반의 네트워크 통신을 통해 데이터를 주고받습니다.

그러나 여기에 두가지 문제점이 발생할 수 있습니다.

1. 네트워크가 문제가 있을 때 레디스를 사용할 수 없다.

2. 레디스 서버가 내려갔을 때, 동시성 문제가 다시 발생한다.

즉, 락을 레디스만을 의존해서 구현하게 되는 것은, "어떤 순간에도 동시성 문제를 보장해준다" 라는 것을 지켜주지 못합니다.

그래서 저는 여기에 DB 락을 추가하여 애플리케이션 레벨에 DB 레벨에서도 락을 거는 방법으로 보완해보고자 합니다.

그리고 DB 락을 추가했을 때, 성능이 어떻게 되는지도 비교해보겠습니다.

## **AS-IS**

'게시글 조회시 게시글의 조회수가 1만큼 증가한다.'라는 비즈니스 로직을 분산락을 사용해서 구현해봤습니다.

```kotlin
fun getArticleWithLock(articleId: Long): Article {
        val key = "article:$articleId"
        val lockKey = "article:lock:$articleId"
        val lock = redissonClient.getLock(lockKey)

        try {
            if (lock.tryLock(10, 10, TimeUnit.SECONDS)) {
                return redisTemplate.opsForValue().get(key)?.let { cachedArticle ->
                    log.info("cache hit")
                    objectMapper.convertValue(cachedArticle, Article::class.java).also {
                        it.increaseViewCount()
                    }
                } ?: run {
                    log.info("cache miss")
                    articleRepository.findByIdOrNull(articleId)?
                    .also { article ->
                        redisTemplate.opsForValue().set(key, article, 5L, TimeUnit.SECONDS)
                        article.increaseViewCount()
                    }.also { it!!.increaseViewCount() } ?: throw ArticleNotFountException()
                }
            } else {
                throw LockingFailedException("$articleId")
            }
        } finally {
            if (lock.isHeldByCurrentThread) {
                lock.unlock()
            }
        }
    }
```
`tryLock()`으로 락 획득을 10초동안 시도하고 없을 경우 `LockingFailedException`을 던집니다.

그리고 락을 얻더라도 게시글을 조회했을 때, 게시글이 없으면 `ArticleNotFoundException`을 던집니다.

즉 락에 대한 점유 시도 이후 실질적인 조회가 이루어지기 때문에

레디스 서버에 문제가 있거나, 네트워크가 원활하지 않을 경우 아예 게시글 조회 자체가 되지 않는 문제가 발생합니다.

## **락 획득에 실패할 경우에도 조회 허용**

락을 획득하지 못하면 DB 조회를 통해 게시글을 조회할 경우 아래와 같이 구현할 수 있습니다.

```kotlin
fun getArticleWithLock(articleId: Long): Article {
    val key = "article:$articleId"
    val lockKey = "article:lock:$articleId"
    val lock = redissonClient.getLock(lockKey)

    try {
        if (lock.tryLock(10, 10, TimeUnit.SECONDS)) {
            // 락을 얻었을 때의 로직
            return getArticleFromCacheOrDatabase(key, articleId).also {
                increaseArticleViewCount(articleId)
            }
        } else {
            // 락을 얻지 못했을 때의 로직
            log.warn("Could not acquire lock for articleId: $articleId")
            return getArticleFromCacheOrDatabase(key, articleId).also {
                increaseArticleViewCount(articleId)
            }
        }
    } finally {
        if (lock.isHeldByCurrentThread) {
            lock.unlock()
        }
    }
}

private fun getArticleFromCacheOrDatabase(key: String, articleId: Long): Article {
    return redisTemplate.opsForValue().get(key)?.let { cachedArticle ->
        log.info("Cache hit")
        objectMapper.convertValue(cachedArticle, Article::class.java)
    } ?: run {
        log.info("Cache miss")
        articleRepository.findByIdOrNull(articleId)?.also { article ->
            redisTemplate.opsForValue().set(key, article, 5L, TimeUnit.SECONDS)
        } ?: throw ArticleNotFoundException()
    }
}

@Transactional
fun increaseArticleViewCount(articleId: Long) {
    val article = articleRepository.findByIdOrNull(articleId) ?: throw ArticleNotFoundException()
    article.increaseViewCount()
}
```

이제 10초 동안 락을 얻지 못할 경우에도 게시글을 조회할 수 있게됩니다.

그러나 만약 레디스 서버가 다운되어있다면 어떻게 될까요?

인자로 넘겼던 waitTime 의해 10초동안 락을 얻으려고 시도한 후 else문의 DB 요청을 하기 때문에, 모든 요청에 대해 10초가 소요됩니다.

그리고 10초 후, 모든 요청이 DB로 몰리는 `Cache Stempede`가 재발생하게 됩니다.

그래서 저는 이러한 딜레이 시간을 줄이기 위해 게시글 조회 로직의 속도를 체크해봤습니다.

```
2023-09-25T20:58:55.002+09:00  INFO 81992 --- [nio-8080-exec-7] com.example.application.ArticleService   : 게시글 조회 시작: 2023-09-25T20:58:55.002030
Hibernate: 
    select
        a1_0.id,
        a1_0.content,
        a1_0.title,
        a1_0.user_id,
        a1_0.view_count 
    from
        article a1_0 
    where
        a1_0.id=?
2023-09-25T20:58:55.004+09:00  INFO 81992 --- [nio-8080-exec-7] com.example.application.ArticleService   : 게시글 조회 종료: 2023-09-25T20:58:55.004056
```
조회가 걸리는 시간은 평균 약 2.026ms가 걸렸으므로, 네트워크 지연시간 등을 포함하여 대략 1초로 설정했습니다.

조회시간은 서버 상태에 따라 가변적이며, Redis를 사용하기 때문에 네트워크를 타게 되어 조회 시간보다 넉넉하게 주어야합니다.

```kotlin
@Transactional(readOnly = true)
fun getArticleWithLock(articleId: Long): Article {
    val key = "article:$articleId"
    val lockKey = "article:lock:$articleId"
    val lock = redissonClient.getLock(lockKey)

    try {
        if (lock.tryLock(1, 10, TimeUnit.SECONDS)) {
            // 락을 얻었을 때의 로직
            return getArticleFromCacheOrDatabase(key, articleId).also {
                increaseArticleViewCount(articleId)
            }
        } else {
            // 락을 얻지 못했을 때의 로직
            return getArticleDirectlyFromDatabase(articleId).also {
                increaseArticleViewCount(articleId)
            }
        }
    } finally {
        if (lock.isHeldByCurrentThread) {
            lock.unlock()
        }
    }
}

private fun getArticleDirectlyFromDatabase(articleId: Long): Article {
    return articleRepository.findByIdOrNull(articleId) ?: throw EntityNotFoundException()
}

private fun getArticleFromCacheOrDatabase(key: String, articleId: Long): Article {
    return redisTemplate.opsForValue().get(key)?.let { cachedArticle ->
        log.info("Cache hit")
        objectMapper.convertValue(cachedArticle, Article::class.java)
    } ?: run {
        log.info("Cache miss")
        articleRepository.findByIdOrNull(articleId)?.also { article ->
            redisTemplate.opsForValue().set(key, article, 5L, TimeUnit.SECONDS)
        } ?: throw EntityNotFoundException()
    }
}
```

## **별도의 락을 추가해서 보완하기**

현재 락을 얻지 못할 경우에는 DB에 직접 조회하기 때문에

만약 레디스 서버가 내려져있을 때에는 다시 동시성 이슈가 발생합니다.

이러한 점을 보완하기 위해 JPA의 락을 사용해볼 수 있는데, 격리 레벨에 따라 두가지로 나뉩니다.

### **낙관적 락**

낙관적 락의 경우 충돌이 발생하지 않을 것이라고 가정합니다.

DB 레벨의 락을 사용하지 않고 어플리케이션 레벨에서의 락을 사용하며

별도의 컬럼을 통해 버전을 관리합니다.

동시에 게시글을 수정하는 두 요청이 존재한다고 가정해보겠습니다.

두 요청은 각각 조회시 버전 1의 엔티티를 얻게됩니다.

그리고 첫번째 요청이 먼저 수정이 완료되어 커밋하게 되면 엔티티는 버전 2로 올라가게 됩니다.

그 후 두번째 요청이 커밋될 때 버전을 확인하는데 이미 엔티티는 버전 2인데 두번째 요청의 엔티티는 버전 1을 수정한 것이기에 버전 불일치가 일어나서 예외가 발생하게 됩니다.

즉, **최초의 커밋만 인정됩니다.**

버전을 비교하는 방법으로는 UPDATE 쿼리시 확인해볼 수 있습니다.

```sql
UPDATE ARTICLE
SET
title = ?,
content = ?,
version = ?
WHERE
id = ?,
and version = ?
```

위처럼 업데이트시 버전이 올라가고, 조건문으로 버전을 검증합니다.

### **비관적 락**

실제로 DB 락을 사용해서 동시성을 제어합니다.

`LockModeType.PESSIMISTIC_WRITE` 옵션의 경우

`SELECT ... FOR UPDATE`를 활용해서 배타 락을 걸게되며,

장점으로는 NON-REPEATABLE READ를 방지합니다.

> 서로의 자원이 필요한 경우, S락은 공존이 가능하나 X락의 경우 공존이 불가능하여 S락을 얻은 상태에서 X락을 서로 획득하려고 할 때 데드락이 발생할 가능성이 있다.

### **어떤 락을 사용해야 하나?**

무결성이 중요하고, 롤백이 자주 발생하는 경우 효율성을 챙기기 위해 사용하는 것이 좋다고 생각합니다.

현재 로직은 단순히 조회수를 증가하는 것에 락을 사용해보기 위함이므로

낙관적 락을 사용해서 동시성을 제어해보고자 합니다.

## **낙관적 락을 적용한 로직**

낙관적 락은 버전을 통해 엔티티를 관리하므로, 컬럼을 추가해주어야합니다.

```kotlin
@Entity
@Table(name = "article")
class Article(

    @Version
    var version: Long = 0L,

    val content: String,

    val title: String,

    val userId: Long,

    var viewCount: Int = 0,

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    val id: Long = 0L

    // ...
) 
```

비즈니스 로직에는 변경할 필요 없이 컬럼 추가로 낙관적 락을 사용하는 것이 가능합니다.

## **정리**

지금까지 Redis 락을 이용했을 때의 주의점과 문제점을 보완하는 방법에 대해 정리해보았는데요.

최종적인 플로우는 아래 순서로 이루어집니다.

1. 게시글 조회 요청
2. 락 획득 시도
3. 락을 획득했을 경우 Look-Aside로 게시글 조회 (선 캐시 조회, 없을 경우 DB 질의)
4. 락을 `waitTime`동안 획득하지 못했을 경우 DB에 직접 조회

그러나 **락을 획득하지 못했는데 게시글을 DB에서 직접 조회하는 것을 허용해야하는가**에 대해서는 고민해볼 여지라고 생각합니다.

현 게시글 조회의 경우 2.026ms가 걸리기 때문에 넉넉하게 1초 내에 이전 요청이 락을 해제하는 일은 없을 것이라고 생각합니다.

그렇기때문에 `waitTime`동안 락을 획득하지 못했을 경우, 레디스 서버에 문제가 있는 것이기 때문에 직접 DB에 질의하는 것입니다.

만약 **락을 획득하지 못하면 게시글 조회를 할 수 없다.** 라는 조건일 경우에는 DB에 질의하지 않고 예외를 반환하면 될 것 같습니다.

















































