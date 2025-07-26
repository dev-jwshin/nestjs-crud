import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * CRUD Exception Filter
 * 
 * nestjs-crud에서 발생하는 모든 HTTP 예외를 통일된 형식으로 변환합니다.
 * message는 항상 배열 형태로 반환됩니다.
 * 
 * @example
 * ```typescript
 * // 전역 적용
 * app.useGlobalFilters(new CrudExceptionFilter());
 * 
 * // 컨트롤러별 적용
 * @UseFilters(CrudExceptionFilter)
 * @Controller('users')
 * export class UserController {}
 * 
 * // 메서드별 적용
 * @Post()
 * @UseFilters(CrudExceptionFilter)
 * async create() {}
 * ```
 */
@Catch(HttpException)
export class CrudExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();

    // 기존 예외 응답 가져오기
    const exceptionResponse = exception.getResponse();

    let message: string[];

    if (typeof exceptionResponse === 'string') {
      // 단순 문자열 메시지인 경우
      message = [exceptionResponse];
    } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const responseObj = exceptionResponse as any;

      if (Array.isArray(responseObj.message)) {
        // 이미 배열인 경우 (class-validator 에러 등)
        message = responseObj.message;
      } else if (typeof responseObj.message === 'string') {
        // 문자열 메시지인 경우 배열로 변환
        message = [responseObj.message];
      } else {
        // message 속성이 없거나 예상치 못한 형태인 경우
        message = [this.getDefaultMessage(status)];
      }
    } else {
      // 예상치 못한 응답 형태인 경우
      message = [this.getDefaultMessage(status)];
    }

    // 통일된 응답 형식으로 변환
    const errorResponse = {
      message,
      statusCode: status,
    };

    response.status(status).json(errorResponse);
  }

  /**
   * HTTP 상태 코드에 따른 기본 메시지 반환
   */
  private getDefaultMessage(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad Request';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.METHOD_NOT_ALLOWED:
        return 'Method Not Allowed';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'Unprocessable Entity';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'Internal Server Error';
      default:
        return 'An error occurred';
    }
  }
} 