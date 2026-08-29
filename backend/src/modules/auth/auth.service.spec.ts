import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Admin } from '@prisma/client';
import { AdminRepository } from './admin.repository';
import { AuthService } from './auth.service';

const KNOWN_PASSWORD = 'correct-horse-battery-staple';
const KNOWN_PASSWORD_HASH =
  '$2b$10$5gP8fNJFaoCM4f8Z2.dML.4a/cwkzhq7W1OA9kUb7NQlemaSYn4aC';

function makeAdmin(overrides: Partial<Admin> = {}): Admin {
  return {
    id: 'admin-1',
    username: 'alice',
    passwordHash: KNOWN_PASSWORD_HASH,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeService(findByUsername: jest.Mock) {
  const adminRepository = {
    findByUsername,
  } as unknown as AdminRepository;
  const signAsyncMock = jest.fn().mockResolvedValue('signed-jwt-token');
  const jwtService = { signAsync: signAsyncMock } as unknown as JwtService;
  const service = new AuthService(adminRepository, jwtService);
  return { service, signAsyncMock };
}

describe('AuthService', () => {
  it('returns an access token for correct username + password', async () => {
    const findByUsername = jest.fn().mockResolvedValue(makeAdmin());
    const { service, signAsyncMock } = makeService(findByUsername);

    const result = await service.login('alice', KNOWN_PASSWORD);

    expect(result).toEqual({ accessToken: 'signed-jwt-token' });
    expect(signAsyncMock).toHaveBeenCalledWith({
      sub: 'admin-1',
      username: 'alice',
    });
  });

  it('rejects a correct username with the wrong password', async () => {
    const findByUsername = jest.fn().mockResolvedValue(makeAdmin());
    const { service } = makeService(findByUsername);

    await expect(service.login('alice', 'wrong-password')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown username with the same error as a wrong password', async () => {
    const findByUsername = jest.fn().mockResolvedValue(null);
    const { service } = makeService(findByUsername);

    await expect(service.login('nobody', 'any-password')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws ServiceUnavailableException when the database is unreachable', async () => {
    const findByUsername = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED'));
    const { service } = makeService(findByUsername);

    await expect(service.login('alice', KNOWN_PASSWORD)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
