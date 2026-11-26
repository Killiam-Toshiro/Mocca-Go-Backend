import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  PHONE_MESSAGE,
  phoneToE164,
  trimmed,
} from '../customers/customers.dto';
import {
  STAFF_ROLES,
  StaffRole,
  USER_ROLES,
  UserRole,
} from './entities/user.entity';
import { PaginationQueryDto } from '../common/pagination';

/** Username canónico; idéntico al CHECK users_username_format. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export class CreateUserDto {
  @ApiProperty({
    pattern: USERNAME_PATTERN.source,
    minLength: 3,
    maxLength: 64,
    description:
      'Minúsculas ASCII, dígitos y `._-`, empezando por letra o dígito.',
    example: 'nuevo_operador',
  })
  @IsString()
  @Matches(USERNAME_PATTERN)
  username!: string;

  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    format: 'password',
    description: 'Contraseña inicial; se guarda con hash scrypt.',
  })
  @IsString()
  @Length(12, 128)
  password!: string;

  @ApiProperty({
    enum: STAFF_ROLES,
    example: 'operador',
    description: 'Rol de personal. `cliente` solo nace del registro propio.',
  })
  @IsIn(STAFF_ROLES)
  role!: StaffRole;

  @ApiPropertyOptional({
    example: '300 123 4567',
    description:
      'Obligatorio para el rol `repartidor`. Celular colombiano o internacional; se guarda en E.164.',
  })
  @Transform(phoneToE164)
  @ValidateIf(
    (object: CreateUserDto, value) =>
      object.role === 'repartidor' || value !== undefined,
  )
  @IsString({ message: PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 80,
    example: 'Carlos Gómez',
    description:
      'Obligatorio para el rol `repartidor`; lo ve el cliente cuando su pedido va en camino.',
  })
  @Transform(trimmed)
  @ValidateIf(
    (object: CreateUserDto, value) =>
      object.role === 'repartidor' || value !== undefined,
  )
  @IsString()
  @Length(2, 80)
  fullName?: string;
}

export class UpdateUserDto {
  // Ningún campo admite null: solo se omite cuando es undefined.
  @ApiPropertyOptional({
    pattern: USERNAME_PATTERN.source,
    minLength: 3,
    maxLength: 64,
    description: 'Envía al menos un campo.',
    example: 'operador_renombrado',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(USERNAME_PATTERN)
  username?: string;

  @ApiPropertyOptional({
    minLength: 12,
    maxLength: 128,
    format: 'password',
    description:
      'Contraseña nueva; revoca las demás sesiones del usuario editado.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(12, 128)
  password?: string;

  @ApiPropertyOptional({
    example: '+57 300 123 4567',
    description:
      'Teléfono de contacto (personal o cliente); se guarda en E.164.',
  })
  @Transform(phoneToE164)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({
    minLength: 2,
    maxLength: 100,
    description:
      'Nombre de contacto: 2 a 80 caracteres para el personal y 2 a 100 para un cliente.',
  })
  @Transform(trimmed)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(2, 100)
  fullName?: string;
}

export class ChangeRoleDto {
  @ApiProperty({
    enum: STAFF_ROLES,
    example: 'admin',
    description: 'Rol de personal; un cliente no cambia de rol.',
  })
  @IsIn(STAFF_ROLES)
  role!: StaffRole;
}

// PostgreSQL no admite NUL en texto: se rechaza con 400, no con 500.
// eslint-disable-next-line no-control-regex -- el NUL es justamente lo que se rechaza
const NO_NUL = /^[^\u0000]*$/;
const splitRoles = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? [...new Set(value.split(','))] : value;

export class ListUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    maxLength: 100,
    example: '300 123',
    description:
      'Texto parcial, sin distinguir mayúsculas, en el usuario, el nombre, el teléfono y el correo del cliente. Con 3 o más dígitos también busca en los dígitos del teléfono. Si queda vacío tras recortarlo se ignora.',
  })
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(NO_NUL)
  search?: string;

  @ApiPropertyOptional({
    type: 'string',
    example: 'admin,operador,repartidor',
    description:
      'Uno o varios roles separados por coma (`admin`, `operador`, `repartidor`, `cliente`); los repetidos cuentan una vez.',
  })
  @Transform(splitRoles)
  @IsOptional()
  @IsIn(USER_ROLES, { each: true })
  role?: UserRole[];
}
