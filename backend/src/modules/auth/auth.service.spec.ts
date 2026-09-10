import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
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

  it('changes the password after verifying the current password', async () => {
    const findByUsername = jest.fn();
    const updatePassword = jest.fn().mockResolvedValue(makeAdmin());
    const findById = jest.fn().mockResolvedValue(makeAdmin());
    const adminRepository = {
      findByUsername,
      findById,
      updatePassword,
    } as unknown as AdminRepository;
    const jwtService = { signAsync: jest.fn() } as unknown as JwtService;
    const service = new AuthService(adminRepository, jwtService);

    await service.changePassword('admin-1', KNOWN_PASSWORD, 'new-password');

    expect(updatePassword).toHaveBeenCalledWith('admin-1', expect.any(String));
    const [, hash] = updatePassword.mock.calls[0] as [string, string];
    await expect(bcrypt.compare('new-password', hash)).resolves.toBe(true);
  });

  it('rejects a password change when the current password is wrong', async () => {
    const findById = jest.fn().mockResolvedValue(makeAdmin());
    const updatePassword = jest.fn();
    const adminRepository = {
      findById,
      updatePassword,
    } as unknown as AdminRepository;
    const service = new AuthService(adminRepository, {
      signAsync: jest.fn(),
    } as unknown as JwtService);

    await expect(
      service.changePassword('admin-1', 'wrong-password', 'new-password'),
    ).rejects.toThrow(UnauthorizedException);
    expect(updatePassword).not.toHaveBeenCalled();
  });
});
