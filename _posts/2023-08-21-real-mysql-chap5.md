---
title: "Real MySQL 8.0 - 트랜잭션과 잠금"
date: 2023-08-21 20:12:00 +0900
aliases: 
tags: [Transaction,Lock,MySQL,Real MySQL 8.0]
categories: [DB]
---

Real MySQL 8.0의 챕터 5. 트랜잭션과 잠금을 읽고 나중에 기억할만한 것들을 정리한 글입니다.

## 서론

트랜잭션은 작업의 원자성을 보장해주는 것, 보장해주지 못할 경우 Partial update가 발생한다.

락과 트랜잭션은 비슷한 개념같지만 다르다.

**락** -> 동시성을 제어하기 위한 기능
**트랜잭션** -> 데이터의 정합성을 보장하기 위한 기능

## 트랜잭션

하나의 트랜잭션 내에 쿼리가 한개여도 트랜잭션의 가치는 소중하다.

**원자성**을 보장하기 때문

원자성을 테스트해보기 위해 다음과 같은 SQL이 있다.

```sql
INSERT INTO tab_innodb (fdpk) VALUES (3);

# 커밋 후 아래 커맨드 입력

INSERT INTO tab_innodb (fdpk) VALUES (1),(2),(3);
ERROR 1062(23000): Duplicate entry '3' for key 'PRIMARY'

# 결과는 기존의 3 하나만 남아있다.
```

1,2가 입력되고 3이 입력되려 하지만 기존에 3이 있으므로, PK 중복 에러로 트랜잭션이 롤백되고 1,2,3 전부 INSERT가 수행되지 않는다.

## 주의사항

트랜잭션의 범위를 최소화하라.

만약 게시글을 등록하는 로직이 있을 때, 게시글 유효성 확인이나 로그인 체크와 같은 것은 데이터를 저장하는 것이 아니며,

게시 후 알림 메일을 전송하는 것과 같은 네트워크 통신 과정은 트랜잭션 범위에서 제거해야한다.

## **MySQL 엔진의 잠금**

MySQL에서의 잠금은 크게 스토리지 엔진의 잠금, MySQL 엔진의 잠금으로 나눌 수 있다.

### 글로벌 락(Global Lock)

> FLUSH TABLES WITH READ LOCK

MySQL에서 제공하는 범위가 가장 큰 잠금이다.

한 세션에서 글로벌 락을 획득하면, 다른 DDL,DML 문장은 락이 해제될 때까지 대기상태로 빠진다.

또한 작업 대상의 테이블이나 데이터베이스가 다르더라도 영향을 미친다.

범위가 크므로, 가급적 사용하지 말자.

또한 트랜잭션이 존재하기 때문에 일관성을 지키기 위해 다른 모든 데이터의 변경 작업을 멈출 필요는 없다.

### 테이블 락(Table Lock)

> LOCK TABLES table_name [ READ | WRITE ]

개별 테이블 단위로 설정되는 잠금

`UNLOCK TABLES` 명령으로 잠금을 반납할 수 있으며, 온라인 작업에 상당한 영향을 미치기 때문에 가급적 권장하지 않는다.

또한 InnoDB 테이블의 경우 스토리지 엔진 차원에서 레코드 기반의 잠금을 제공한다.

### 네임드 락(Named Lock)

> GET_LOCK()

임의의 문자열에 대해 잠금을 설정할 수 있다.

### 메타데이터 락(Metadata Lock)

데이터베이스 객체의 이름이나 구조를 변경하는 경우에 획득하는 잠금

## InnoDB 스토리지 엔진의 잠금

레코드 기반의 잠금 방식을 제공한다.

### 자동 증가 락

AUTO_INCREMENT 컬럼 속성을 제공하는 특성상,

동시에 여러 레코드가 INSERT 요청이 들어올 경우 중복되지않고 순차적인 PK를 가지기 위해 내부적으로 테이블 수준의 잠금을 사용한다.

UPDATE, DELETE의 경우에는 사용되지 않는다.

### **인덱스와 잠금**

InnoDB는 레코드를 잠금하지 않고 인덱스를 잠금하는데,

UPDATE시 지정한 조건에 인덱스가 있을 경우 인덱스에 해당하는 모든 레코드를 잠금한다.

인덱스를 적절히 준비하지 않을 경우 동시성이 떨어지는 문제가 발생하는 것이다.

반대로 인덱스가 하나도 없을 경우, 테이블 풀 스캔이 작동하며, 모든 레코드에 대해 잠금이 걸린다.

## **MySQL의 격리 수준**

여러 트랜잭션이 동시에 처리될 때 특정 트랜잭션에서 변경이나 조회하는 데이터를 볼 수 있게 허용할 지 말지를 결정한다.

크게 4가지로 나뉜다.
- READ UNCOMMITTED
- READ COMMITTED
- REPEATABLE READ
- SERIALIZABLE

그중 더티 리드라고 하는 READ UNCOMMITTED와 SERIALIZALBLE은 거의 사용하지 않는다.

### **READ UNCOMMITTED**

![read uncommitted](/assets/img/2023-08-21-real-mysql-chap5/read-uncommitted.webp)

사용자 A의 트랜잭션에서 커밋 전에 반영한 내용이 사용자 B의 트랜잭션에서 조회할 수 있다.

사용자 A의 트랜잭션이 롤백되어도 B는 정상 데이터로 판단하고 트랜잭션을 수행한다.(DIRTY READ)

### **READ COMMITTED**

![read committed](/assets/img/2023-08-21-real-mysql-chap5/read-committed.webp)

커밋이 되지 않는 데이터는 조회되지 않는다.

언두 로그를 사용하며, 값을 변경하면 테이블에는 반영되지만 변경 전의 데이터는 언두 로그로 백업된다.

사용자 B의 트랜잭션에서 커밋 전의 테이블 데이터를 조회하면 백업된 언두 로그로부터의 'Lara'가 조회된다.

그러나 여전히 `NON-REPEATABLE READ` 문제가 존재한다.

![non repeatable-read](/assets/img/2023-08-21-real-mysql-chap5/non-repeatable-read.webp)

사용자 B가 처음 조회했을 때 값이 없던 데이터가, 사용자 A의 트랜잭션이 값을 커밋한 후 다시 조회할 경우 값이 존재한다.

이는 **하나의 트랜잭션에서는 항상 같은 결과를 보장한다**는 정합성의 불일치가 발생하게 된다.

### **REPEATABLE READ**

기본적으로 사용되는 잠금 수준

![repeatable-read](/assets/img/2023-08-21-real-mysql-chap5/repeatable-read.webp)


전에 언급했던 `NON REPEATABLE READ` 문제가 발생하지 않는다.

변경된 값에 대해 롤백을 대비해서 MVCC(Multi Version Concurrency Control) 방식으로 언두 로그에 백업을 한다.

READ COMMITTED도 언두 로그를 이용하지만, 트랜잭션 아이디를 통한 비교가 다르다.

사진처럼, 사용자 B의 트랜잭션은 10번이며 사용자 A의 트랜잭션은 12번인 경우를 가정하자.

10번 트랜잭션 내에서 조회하는 값들은 트랜잭션 ID가 10번 이전인 데이터만을 보게 된다.

그렇지만 부정합의 문제는 여전히 존재하는데,

![phantom-read](/assets/img/2023-08-21-real-mysql-chap5/phantom-read.webp)

SELECT 쿼리는 언두 영역에 잠금을 걸 수 없기 때문에 데이터가 보였다 안보였다 하는 팬텀 리드가 발생한다.

### SERIALIZABLE

일반적으로 SELECT 쿼리는 Non-locking consistend read(잠금이 필요없는 일관된 읽기)로 수행되지만, 

SERIALIZABLE로 격리 수준을 설정하면 읽기 조차도 락을 얻어야한다.

그러나 InnoDB에서는 갭 락과 네임드 락에 의해 REPEATABLE READ에서 팬텀 리드가 발생하지 않기 때문에,

가급적 REPEATABLE READ 이상으로만 격리 수준을 선택하자.


























