---
title: "JPA에서 PK를 직접 할당할 때의 주의점"
date: 2023-07-19 3:6:27 +0900
aliases: 
tags: [JPA]
categories: [Spring]
---

JPA에서 ID를 @GeneratedValue 어노테이션을 사용하지 않고

직접 생성해서 객체에 넣어주고 save() 함수를 호출했을 때 기대했던 insert 쿼리가 아닌, select 쿼리가 하나 더 발생하는 것에 대해 학습하고, 공유하게 된 글입니다.

## AS-IS

우선, 회원 도메인이 다음과 같이 있다고 가정하겠습니다.

```kotlin
@Entity
@Table(name = "users")
class User(

    @Column(name = "username")
    private val username: String,

    @Column(name = "nickname")
    private val nickname: String,

    @Column(name = "email", unique = true)
    private val email: String,

    @Column(name = "password")
    private val password: String,

    @Column(name = "account", unique = true)
    private val account: String,

    @Id
    val id: Long
) : BaseEntity()
```

일반적인 유저 엔티티 클래스이며, 패스워드 인코더와 같은 것은 제외하겠습니다.

그리고 다음과 같은 경로로 회원가입을 시도해보겠습니다.

```json
{   
    "account":"test",
    "password":"1234",
    "username" : "wavefomymind",
    "email" : "test1234@naver.com"
}
```

그리고 id 값은 객체를 생성할 때 넣어줍니다.

```kotlin
@Service
@Transactional
class RegisterUserServiceImpl(
    private val userRepository: UserRepository
) : RegisterUserService {
    override fun registerUser(command: RegisterUserCommand) {
    	val user = User(command.account,command.password,command.username,command.email,2L)

    	userRepository.save(user)
    }
}
```

테스트를 위해 2L이라는 아이디 값을 User를 생성할 때 넣어주었습니다.

예상대로면 User를 DB에 저장하기 위해 Insert가 발생할 것이라고 예상할 수 있습니다.

이제 결과를 확인해볼까요?

![as-is](/assets/img/2023-07-19-id-directly-assign/asis.webp)

예상과 다르게 select 문이 발생하고 그 다음으로 insert가 발생했습니다.

## save()

그 이유는 save 메서드에 있습니다.

save 메서드를 디버깅해보면 다음과 같이 구현되어있습니다.

![save](/assets/img/2023-07-19-id-directly-assign/save.webp)

저희가 DB에 저장하려는 객체 데이터가 새로운 레코드인지, 기존의 레코드인지 확인하게됩니다.

이때 예전에 EntityManager를 직접 다루었을 때, persist와 merge가 기억나시나요?

`persist`는 새로운 엔티티를 영속 상태로 만들고, 트랜잭션이 커밋되는 시점에 DB에 저장됩니다.

그리고 `merge`는 준영속 상태의 엔티티를 다시 영속 상태로 만들며, 변경된 내용을 DB에 저장합니다.

이때 merge에 의해 select 쿼리가 발생하게 됩니다.

해당 엔티티가 이미 DB에 있는지 없는지를 체크하기 위해 조회를 해보는 것인데요.

그리고 준영속 상태에 있는 엔티티를 다시 영속 상태로 만들기 위해 조회 쿼리를 발생하게 되는 것이죠.

그런데, 저희가 `save`하는 엔티티는 새로운 엔티티임이 분명한데 어째서 isNew(Entity)의 결과로 false를 반환하고 `merge`가 실행되는 것일까요?

## isNew()

isNew() 함수가 어떻게 구현되어있는지 확인해봅시다.

isNew() 함수를 파고들어가보면 다음과 같이 구현되어져있습니다.

![isNew2](/assets/img/2023-07-19-id-directly-assign/isnew.webp)

id 타입이 원시 타입이 아닐 경우 null과 비교를 하여 null이면 새로운 엔티티, 아닐 경우 false를 반환합니다.

또한 id가 원시 타입일 경우 id가 숫자이면서 0이면 새로운 엔티티, 아닐 경우 다시 false를 반환하게 되는 것입니다.

즉, 저희가 1L 이상으로 id값을 넣어주었기 때문에 원시 타입이 아니면서, null과 비교를 했을 때 false를 반환하게 되어 결국 merge가 호출하게 되는 것입니다.

그렇다면 결국 직접 id값을 제어하는 것이 문제일까요?

## Persistable

![persistable](/assets/img/2023-07-19-id-directly-assign/persistable.webp)

isNew() 메서드는 Persistable 인터페이스를 상속받은 오버라이딩된 함수입니다.

즉, id값을 제어하고싶은 엔티티 클래스에서 Persistable을 상속받아 isNew() 함수를 직접 구현하면 됩니다.

```kotlin
@Entity
@Table(name = "users")
class User(

    @Column(name = "username")
    private val username: String,

    @Column(name = "nickname")
    private val nickname: String,

    @Column(name = "email", unique = true)
    private val email: String,

    @Column(name = "password")
    private val password: String,

    @Column(name = "account", unique = true)
    private val account: String,

    @Id
    var id: Long = 0L,
) : BaseEntity(), Persistable<Long> {

    override fun getId(): Long {
        return id
    }

    override fun isNew(): Boolean {
        return createdDate == null
    }
}

...

@MappedSuperclass
@EntityListeners(AuditingEntityListener::class)
abstract class BaseEntity {
    @CreatedDate
    @Column(updatable = false)
    val createdDate: LocalDateTime? = null

    @LastModifiedDate
    val modifiedDate: LocalDateTime? = null
}

```

createdDate는 초기값이 null이며, 처음으로 영속화될때 @CreatedDate에 의해 생성됩니다.

그렇기 때문에 처음 생성되었을 때에는 null임을 보증하기 때문에

createdDate == null로 isNew() 함수의 반환값을 주면,

새로 생성된 엔티티인지 아닌지를 검증할 수 있습니다.

위처럼 구현하고 다시 가입을 해볼까요?


![result](/assets/img/2023-07-19-id-directly-assign/result.webp)

이번에는 Insert만 발생한 것을 알 수 있었습니다.

## 코틀린에서의 id값 할당할 때의 팁

코틀린에서 주로 id값에 대해 Nullable하게 선언되는 보기가 많은데요.

이에 대해서 새로이 알게된 점이 있습니다.

이는 코틀린의 NotNull한 타입이 자바의 원시타입과 같은 역할을 한다는 것인데요.

isNew()를 다시 확인해봅시다.

![isNew3](/assets/img/2023-07-19-id-directly-assign/isnew.webp)

새로운 엔티티임을 판단하는 비교 조건은 2가지가 있었습니다.

1. 래핑 타입이면서 id값이 null일 때,

2. 원시 타입인 경우 Number 인스턴스이면서, 0L일때가 있습니다.

그러나, 코틀린의 경우 Long 타입은 래핑 타입이지만, nullable을 ?로 구분하기 때문에

결국 자바의 원시 타입인 long처럼 취급이 됩니다.

그렇기 때문에 isNew() 메서드의 과정 중,

1번에서는 True를 받아 통과하고, 2번에서 새로운 엔티티인지 체크를 하게 되는 것입니다.

그래서 저는 id를 선언할 때 다음과 같이 선언하는데요.

```kotlin
@Id
@GeneratedValue(strategy = GenerationType.IDENTITY)
val id: Long = 0L,
```

위처럼 0L로 선언해도 새로운 엔티티로 간주하여 영속성으로 등록하기 때문에

굳이 Long?타입일 필요가 없게됩니다.

또한 초깃값이 0L인데 val 타입이여서 값이 재할당이 안될 것 처럼 생각이 들어도

그렇지 않습니다.

Hibernate는 자바의 리플렉션 API를 사용해서 DB의 데이터를 조회하고, 이를 객체에 매핑할 때 필드에 직접 접근할 수 있기 때문에 val로 선언하더라도 DB에서 id 컬럼 값으로 업데이트 될 수 있습니다.










