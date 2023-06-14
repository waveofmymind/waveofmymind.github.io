---
title: "로그 수집을 위한 AWS CloudWatch 적용기"
date: 2023-06-14 21:29:00 +0900
aliases: 
tags: [AWS,AWS CloudWatch,Log]
categories: [DevOps]
---

![AWS Cloudwatch](/assets/img/2023-06-14-aws-cloudwatch/cloudwatch.webp)

logback 사용해서 AWS 클라우드 워치로 로그를 수집하기 위해 설정했던 것을 공유하는 글입니다.

## AS-IS: 셀프 체크 로깅

팀 프로젝트를 진행 중, 팀장으로 참여했기 떄문에 팀원들이 개발을 할 때 편하게 했으면 좋겠다는 생각이 들어 개발 서버에 대해 CI/CD 구축을 하게 되었습니다.

Github Webhook -> Jenkins -> Docker의 순서대로 CI/CD가 이루어져 NCP의 EC2에 배포가 되는 것입니다.

그러나 문제는 이제 시작이였는데요.

이전 프로젝트에서는 백엔드가 저 혼자였기때문에 로그를 확인하기 위해서 NCP에 접속해서 docker logs -f 명령어를 사용해서 찍어보는데 귀찮지만 문제가 없다고 생각했습니다.

그러나 이번엔 백엔드 개발자가 여럿인 만큼 각자의 개발 상황에 따라 서버에서 로그를 찍어볼 일이 **매우매우매우** 많았던 것입니다.

이는 DevOps를 제 계정으로 구축하다보니 로그를 체크하는 일은 제 일이 되었습니다.

> ~~~이슈가 있는 것 같은데, 로그를 확인해주실 수 있을까요? 
	-> 네 잠시만요 (도커 접속)이 되었던 것입니다.






