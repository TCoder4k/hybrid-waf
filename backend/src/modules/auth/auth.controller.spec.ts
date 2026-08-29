import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

function makeController(login: jest.Mock = jest.fn()) {
  const authService = { login } as unknown as AuthService;
  return new AuthController(authService);
}

describe('AuthController', () => {
  it('delegates valid credentials to AuthService.login', async () => {
    const login = jest.fn().mockResolvedValue({ accessToken: 'token' });
    const controller = makeController(login);

    const result = await controller.login({
      username: 'alice',
      password: 'secret',
    });

    expect(login).toHaveBeenCalledWith('alice', 'secret');
    expect(result).toEqual({ accessToken: 'token' });
  });

  it('rejects a missing username', () => {
    const controller = makeController();
    expect(() => controller.login({ password: 'secret' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a missing password', () => {
    const controller = makeController();
    expect(() => controller.login({ username: 'alice' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects a non-object body', () => {
    const controller = makeController();
    expect(() => controller.login('not-an-object')).toThrow(
      BadRequestException,
    );
  });

  it('rejects an empty-string password', () => {
    const controller = makeController();
    expect(() => controller.login({ username: 'alice', password: '' })).toThrow(
      BadRequestException,
    );
  });
});
