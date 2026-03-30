# Mottor Plan

`Mottor Plan`은 한 줄 아이디어만 입력하면 `PRD`, `기능명세서`, `유저플로우`를 동시에 생성하는 AI 기반 기획 워크스페이스입니다.  
프론트엔드는 `Vue 3 + Vite`, 백엔드는 `NestJS`, 데이터 저장소는 `Supabase PostgreSQL`을 기준으로 설계했습니다.

## 아키텍처

```text
apps/
  web/    Vue 3 + Vite UI
  api/    NestJS API + Prisma
packages/
  shared/ 프론트/백엔드 공용 타입
```

## 핵심 기능

- 좌측 LLM 챗 입력 패널
- 우측 문서 캔버스(PRD, 기능명세서, 유저플로우)
- Markdown / PDF / PNG 다운로드
- 우상단 히스토리 패널
- LLM provider 추상화
- Supabase PostgreSQL 저장 구조

## 기술 선택

- `pnpm workspace + turbo`
- `Vue 3 + Vite + TypeScript`
- `NestJS + Prisma`
- `PostgreSQL on Supabase`

## 실행 방법

### 1. 의존성 설치

```bash
pnpm install
```

### 2. 환경변수 설정

`apps/api/.env.example`을 참고해서 `apps/api/.env`를 생성합니다.

필수 항목:

- `DATABASE_URL`: Supabase PostgreSQL 연결 문자열
- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`

### 3. Prisma Client 생성

```bash
pnpm --filter @mottor-plan/api prisma:generate
```

### 4. 개발 서버 실행

```bash
pnpm dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3000`

## 데이터 모델

### `GenerationSession`

- 워크스페이스명
- 사용자 프롬프트
- 생성 상태
- 추천 후속 액션
- 생성 시각

### `GeneratedDocument`

- 문서 종류(`PRD`, `FEATURE_SPEC`, `USER_FLOW`)
- 문서 제목
- 버전
- 섹션 JSON

## 실무 확장 권장 사항

- Supabase Auth 기반 조직/사용자/권한 모델 추가
- 다운로드 이벤트 및 감사로그 테이블 추가
- 문서 버전 비교(diff) 기능 추가
- SSE 또는 WebSocket 기반 스트리밍 생성 적용
- 저장된 문서 편집기 및 승인 워크플로우 추가