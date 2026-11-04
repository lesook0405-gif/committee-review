// 주소·양식으로 들어온 ID가 데이터베이스 ID 모양(UUID)인지 확인한다
// (이상한 값이 그대로 데이터베이스까지 가서 오류를 내지 않게, 앞에서 "찾을 수 없음"으로 처리하기 위해)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
