import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  getHello(): { message: string } {
    return { message: 'Hello from the Protected API' };
  }
}
