import { IsNotEmpty, Length, IsString } from 'class-validator';

export class ValidateAdminDto {
    @IsNotEmpty({ message: 'Se necesito el Id del candidato' })
    @Length(6, 6)
    candidatoID: string;
}