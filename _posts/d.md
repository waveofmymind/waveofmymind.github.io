---

title: "네티와 톰캣"
date: 2023-12-31 09:29:00 +0900
aliases: 
tags: [Reactive,Netty,Spring Webflux]
categories: [Spring]

---

최근 레주마블 프로젝트에서 네티를 활용한 이벤트 기반의 스프링 웹 플럭스를 적용하게 되었고, 네티를 선택하게 된 계기와 톰캣에 비해 가지는 점에 대해 테스트를 해보았다.

## Spring MVC 톰캣

레주마블 프로젝트에서는 톰캣을 활용하여 서버를 구축했다.

그러나 면접 예상 질문 서비스는 OpenAi의 API를 통해 결과를 받아 사용자에게 내려주게 되는데, 답변을 생성하는 시간이 20초 정도 소요된다.

그렇기 때문에 사용자가 질문을 생성하고, 웹에서는 로딩 화면이 띄워지더라도 서버에서는 서블릿 스레드가 블로킹 상태가 된다.

이는 Thread Per Request 모델이기 때문이다.

요청에 할당된 스레드가 블로킹 된다는 것은 큰 문제를 야기하는데, 크게 다음과 같다.

1. 리소스가 제한된 시스템에서 스레드가 블로킹되면, 애플리케이션의 다른 부분이나 동일한 서버에서 실행되는 다른 애플리케이션에 대한 리소스 부족이 발생할 수 있다. 블로킹된 스레드는 작업을 수행하지 않는 동안에도 메모리와 같은 리소스를 계속 선점하고 있다.

2. CPU는 쓰레드 단위로 작업을 처리하기 때문에, 사용하고 있는 스레드가 많아질 경우 컨텍스트 스위칭이 자주 일어나 오버헤드가 발생한다.

3. 사용 가능한 모든 스레드가 차단되면 새로 들어오는 요청이 기다려야 하므로 백로그가 발생한다. 이로 인해 성능이 저하되고 사용자 경험이 저하될 수 있다.

스레드 풀을 커스터마이징할 경우, 생성할 수 있는 스레드의 최대 개수와 항상 존재해야하는 스레드의 개수, 작업 큐 사이즈 등을 조절할 수 있다.

그러나 이 경우에도 그만큼 리소스가 필요한 작업(스레드는 힙과 스택을 이용해야하기 때문)이기 때문에, 스케일 업이 불가피하거나 OOM이 발생할 수 있다.

참고로 톰캣 스레드 풀의 default 옵션은 최대 스레드 수 200, 항상 존재해야하는 스레드 개수는 10이다.

## BIO Connector와 NIO Connector

Thread Per Request로 발생하는 문제를 해결하기 위해서, NIO Connector라는 기능을 지원한다.

우선 Connector에 대해서 알아보자.

![connector](/assets/img/2023-12-19-tomcat-and-netty-1/connector.webp)

서블릿이 요청을 처리하기 위해서는 HttpServletRequest 형태가 되어야 하는데,

사용자의 요청을 받아 HttpServletRequest로 변환하는 것이 Connector의 역할이다.

1. 클라이언트의 소켓을 얻는다.
2. 소켓으로부터 소켓 커넥션을 통해 데이터 패킷을 얻는다.
3. 패킷을 파싱해서 HttpServletRequest로 캡슐화한다.
4. HttpServletRequest를 ServletContainer로 보내 적절한 Servlet에 위임한다.

이 요청을 서블릿 요청으로 변환하는데 있어서, 블로킹인 BIO Connector와 논블로킹인 NIO Connector가 있다.

### BIO Connector

![bio connector](/assets/img/2023-12-19-tomcat-and-netty-1/bio-connector.webp)

Blocking I/O Connector는 말 그대로, 블로킹 방식으로 요청당 쓰레드를 배정해 클라이언트 요청을 HttpServletRequest로 변환합니다.

그리고 이 과정을 이해하기 위해서 아래와 같은 구성 요소가 있습니다.

- Acceptor: 클라이언트의 요청을 port listener를 통해 소켓을 얻는다.
- Worker: 소켓을 받아 Http11ConnectionHandler에서 Http11Processor를 얻고 요청을 처리한다.
- CoyoteAdapter: Http11Processor에 의해 호출되며 worker 스레드가 할당된 소켓의 http 요청을 HttpServletRequest 객체로 변환한다.










