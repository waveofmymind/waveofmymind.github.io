---
title: "url 변수 동적으로 받을 수 있도록 개선하기"
date: 2023-05-18 9:29:00 +0900
aliases: 
tags: [Path Variable, Java]
categories: [Java]
---

미션으로 스프링과 유사한 역할을 하는 MVC 프레임워크를 구현하던 중, 기존의 매핑 URL에 대해서 고정적인 위치에서 url 변수를 얻어오던 것을 위치에 상관 없이 동적으로 관리할 수 있도록 개선한 점을 공유하고자합니다.

## AS-IS

문제가 된 예제 코드 Rq 클래스의 메서드는 다음과 같습니다.

```java
public String getPathParam(String paramName, String defaultValue) {
        if ( routeInfo == null ) {
            return defaultValue;
        }

        String path = routeInfo.getPath();

        String[] pathBits = path.split("/");

        int index = -1;

        for ( int i = 0; i < pathBits.length; i++ ) {
            String pathBit = pathBits[i];

            if ( pathBit.equals("{" + paramName + "}") ) {
                index = i - 4;
                break;
            }
        }

        if ( index != -1 ) {
            return getPathValueByIndex(index, defaultValue);
        }

        return defaultValue;
    }
```
웹 요청 경로에서 특정 파라미터 이름에 해당하는 값을 찾는 메서드입니다.

쉽게 생각하면 @PathVariable과 비슷한 기능을 하는 메서드라고 생각하시면 될 것 같습니다.

예를 들어, 2번 게시글을 상세 조회하는 경로, /usr/article/2으로 요청을 한다고 가정하면,

@GetMapping("/usr/article/{id}")

public void showDetail(Rq rq) { ....};

메서드가 받아서 처리하게 되는데,

이때의 {id} 값을 얻어내는 역할을 합니다.

그 전에 ControllerManager 클래스에 의해 RouteInfo 클래스의 객체가 맵을 통해 관리하고,

routeInfo.getPath();로 url 경로를 가져오지만, 이는 본 글의 주제와 벗어나므로 생략하겠습니다.

즉 위 함수의 실행 과정은 아래와 같습니다.

1. routeInfo == null 조건문에서, 만약 현재의 요청 정보가 비어 있다면, 기본값(defaultValue)을 반환합니다. 
2. 그 후, routeInfo.getPath();를 통해 현재 요청의 경로를 얻습니다.(위 예시의 "/usr/article/{id}")
3. String[] pathBits = path.split("/");를 통해 경로를 "/" 단위로 나누어 문자열 배열에 저장합니다. 예를 들어, "/usr/article/modify/{id}"라는 경로가 있으면, 이는 ["usr", "article", "modify", "{id}"]로 분리됩니다.
4. for 문을 돌면서 문자열 리스트를 확인합니다. 만약, 원소가 { paramName } 과 일치하면, 해당 인덱스를 저장하고 중단합니다. 이 때, 인덱스에서 -4 를 하는 이유는, "/usr/article/modify/{id}" 의 경우에는 실제 id 값이 4번 인덱스에 위치하게 됩니다.
5. 인덱스가 -1이 아니라면, 즉 원하는 파라미터를 찾았다면, getPathValueByIndex 메서드를 호출하여 해당 인덱스에 있는 실제 값을 가져옵니다.
6. 인덱스가 -1이라면 원하는 파라미터가 경로에 없다는 것이므로 기본값(defaultValue)을 반환합니다.

그러나 /usr/article/modify/{id}나 /usr/article/{id}의 경로로 요청시에도 기본값만 반환하는 경우가 있었고,

3번 과정에서 문자열을 자를때 맨 앞이 "/"로 시작하기 때문에 0번째 인덱스가 ""의 빈 문자열이 포함되는 문제가 있었습니다.

또한, 항상 index = i - 4 를 하기 때문에 라우팅 경로에 종속되는 문제가 있었습니다.

만약 라우팅 경로가 3개가 있을 경우, index가 -1이 되기 때문에 기본값을 반환하게 되는 것입니다.

## 문제 해결 과정

만약 앞 문자열에 /를 제거하고 routeInfo 클래스에 넣는 방법도 고려했지만,

어노테이션을 통한 value값을 그대로 저장해두는 것이 추후 제가 모르는 오류를 발생할 수 있는 위험성을 차단할 수 있을 것이라고 생각했습니다.

 

그리고 제가 프로젝트를 진행할 때 설계했던 url 패턴이 생각났습니다.

예를 들어 질문글에 대한 리뷰를 조회하고 싶을 때, 1번 질문글에 3번 리뷰를 조회할 경우를 고려해보겠습니다.

 

이때 경로는 http://localhost:8080/questions/1/reviews/3 이 됩니다.

이 경우에 기존의 getPathParam 메서드로는 처리할 수 없는 문제가 있었습니다.

기존 로직은 for문을 통해 {paramName}을 찾으면 바로 종료시키기 때문에 질문글 id 값을 조회하고 바로 종료가 되기 때문입니다.

 

그래서 저는 index 변수를 하나로 관리하기보다, 맵을 사용해서 모든 url 변수에 대해 맵에 넣고, 필요한 값을 컨트롤러 로직에서 꺼내와서 사용할 수 있는 방법이 더 좋을 것이라고 판단했습니다.

 

그리고, 인덱스 값을 i-4와 같이 특정 라우팅 경로에 의존하는 것을 해결하고자 했기 때문에 맵을 사용한 이점을 누릴 수 있었습니다.

맵에 < paramName : i > 의 형태로 for문을 돌다 url 변수의 위치를 넣고,

index 변수로 꺼낼때 단지 map.get(paramName);을 하면 되기 때문입니다.

 

그 후, index 값이 null이면 찾는 url 변수가 없기 때문에 기본값을 반환하며,

null이 아닐 경우에는 getPathValueByIndex() 메서드로 실제 id 값을 반환하면 괜찮겠다고 생각했습니다.

## TO-BE

위 과정대로 개선한 로직은 아래와 같습니다.

```
public String getPathParam(String paramName, String defaultValue) {
        if (routeInfo == null) {
            return defaultValue;
        }

        String path = routeInfo.getPath();

        String[] pathSplitList = path.split("/");

        Map<String, Integer> paramIndexMap = new HashMap<>();

        for (int i = 0; i < pathSplitList.length; i++) {
            String pathBit = pathSplitList[i];

            if (pathBit.startsWith("{") && pathBit.endsWith("}")) {
                String name = pathBit.substring(1, pathBit.length() - 1);
                paramIndexMap.put(name, i);
            }
        }

        Integer index = paramIndexMap.get(paramName);

        if (index != null) {
            return getPathValueByIndex(index, defaultValue);
        }

        return defaultValue;
    }
```

개선한 로직의 실행 순서는 아래와 같습니다.

1. routeInfo가 null인지 확인하고, null일 경우에는 바로 defaultValue를 반환합니다.
2. routeInfo가 null이 아니면, routeInfo에서 경로를 가져와서 이를 "/"로 분할합니다.
3. 다음으로 paramIndexMap이라는 HashMap을 생성합니다. 이 맵에는 각 매개변수의 이름과 그 인덱스가 저장됩니다.
4. 분할한 경로의 각 부분에 대해, 만약 해당 부분이 {}로 시작하고 끝나면, 그것은 url변수라고 판단하고, 매개변수의 이름을 추출해서 그 이름과 인덱스를 맵에 추가합니다.
5. 모든 경로의 부분을 처리한 후, paramIndexMap에서 주어진 매개변수 이름에 해당하는 인덱스를 찾습니다.
6. 만약 인덱스가 존재하면, getPathValueByIndex() 함수를 호출하여 해당 인덱스의 값을 반환합니다. 이 함수는 인덱스에 해당하는 경로의 부분 값을 가져오는 기능을 합니다.
7. 만약 인덱스가 존재하지 않으면, defaultValue를 반환합니다.
이제 라우팅 경로에 의존하는 문제를 해결할 수 있었으며,

url 변수가 여러개가 되어도 맵을 통해 꺼내오면 되기 때문에 유연해졌습니다.

## 아쉬운 점

맵을 통해 url변수를 관리하기 때문에, 만약 key값이 동일할 경우 덮어씌워지는 상황이 발생할 것 같습니다.

그러나 이는 url 패턴을 설계 할 때 다른 목적의 url 변수를 같은 네이밍으로 정하는 것 자체가 잘못된 설계라고 생각합니다.

예를 들어 "/questions/{id}/reviews/{id}"와 같이 사용하는 것은 다른 사람이 보아도 헷갈릴 뿐 더러 좋은 코드가 아닌 것 같습니다.

저는 article에 대해서만 다루고 있기 때문에 "/usr/article/{id}"와 같이 간략하게 사용했지만,

실제로 다른 도메인이 추가되고 기능이 확장된다면 구분을 위해 "/usr/article/{articleId}"와 같이 사용하는 방법이 더 좋을 것 같습니다.

 