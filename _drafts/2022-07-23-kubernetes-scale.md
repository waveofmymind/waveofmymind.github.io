---
title: "[Kubernetes] scale out"
date: 2022-07-22 16:46:00 +0900
tags: [kubernetes, minikube, devops]
categories: [DevOps]
---



### Scale

```bash
kubectl scale deployments/rest-server --replicas=4
```

각 파드에 접근하여 로그를 살펴보면, api 요청이 올때마다 분산처리되는 것을 확인할 수 있다.

0 으로 설정하면 서비스가 종료된다.

```bash
kubectl scale deployments/rest-server --replicas=0
```

명령어 한 번으로 Scale in, out 이 되는 점이 아주 인상적이다.
