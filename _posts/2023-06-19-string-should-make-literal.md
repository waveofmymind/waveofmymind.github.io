---
title: "new 연산자로 String 객체를 생성하면 안되는 이유"
date: 2023-06-13 21:29:00 +0900
aliases: 
tags: [Java,자바,문자열,String]
categories: [Java]
---

![java](/assets/img/java.webp)

자바에서 문자열 객체를 생성할 때 큰 따옴표로 생성하지만, new 연산자로도 생성할 수 있다.

일단 두 테스트를 비교해보자.

```java

@Test
void StringTest1() {
	String value1 = "aaa";
	String value2 = "aaa";

	assertThat(value1).isSameAs(value2);
}

@Test
void StringTest2() {
	String value1 = new String("aaa");
	String value2 = new String("aaa");

	assertThat(value1).isSameAs(value2);
}
```

위 테스트의 결과 중 2번은 통과되지 않는다.

"어 당연히 같은 값으로 객체를 생성하기 때문에 힙 영역의 같은 번지수를 가르키고 있는게 아닌가?"

 라는 생각을 했지만, new 연산자로 생성한 String 객체는 내용이 같더라도 개별적인 객체였다.

 위 원리를 이해하기 위해 String Pool을 알아야한다.

 ## Java String Pool

 new 연산자를 사용해서 String 객체를 생성하지 않는 것이 좋다는 이유는 String Pool때문이다.

 만약 `String value = "안녕";` 과 같이 리터럴로 생성하면 해당 "안녕" 이라는 실제 값은 힙 영역 내의  String Pool에 저장된다.

 그러나 new 연산자를 사용해서 String 객체를 생성하면 String Pool에 이미 존재하더라도, 힙 영역 내 별도의 객체를 가리키게 된다.

 그렇다면 이미 new 연산자로 생성한 String 객체를 String Pool에서 관리하게 할 수는 없을까?

## String interning

String 클래스에는 `intern()`이라는 메서드가 있다.

`intern()`은 해당 String과 동등한(equal) String 객체가 이미 String Pool에 존재하면 그 객체를 리턴한다. 그렇지 않을 경우 호출된 String 객체를 String Pool에 추가하고 객체의 reference를 리턴한다.

만약, new 연산자를 사용해서 String 객체를 생성헀을 경우 `intern()` 메서드를 사용한 다음부터 해당 객체는 String Pool에서 관리된다.

```java

@test1
void StringTest3() {
	String beforeInterning = "aaa";
	String notInternString = new String("aaa");
	assertThat(beforeInterning).isNotSameAs(notInternString);

	String internedString = notInternString.intern();
	assertThat(beforeInterning).isSameAs(internedString)
}
```

new 연산자를 사용해서 생성한 String 객체는 String Pool 밖에 있었지만, `intern()` 메서드를 호출한 후 String Pool로 이동하여 String Pool에 원래 있던 객체와 동일한 reference 값을 가지게 된다.

## 결론

String 객체를 new 연산자로 생성하면 같은 값이라 할지라도 힙 영역에 매번 새로운 객체가 생성된다.

따라서 String의 불변성을 잃게 된다.

또한 같은 값이라도 메모리를 하나 더 사용하고 있기 때문에, 메모리를 효율적으로 사용하기 위해서도, 불변성을 잃지 않게 하기 위해서라도 String literal(큰 따옴표)로 String을 생성하느 것이 좋다.

## 레퍼런스

- [Guide to Java String Pool](https://www.baeldung.com/java-string-pool)



