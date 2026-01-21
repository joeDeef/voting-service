export class SetTimeDto {
  userId: string;
  role: string;
  expirationTime: number; // Formato Unix Timestamp (segundos)
}