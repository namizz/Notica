import * as nodemailer from 'nodemailer';
import { EmailSendError } from './email-provider.interface';
import { SmtpProvider } from './smtp.provider';

jest.mock('nodemailer');

describe('SmtpProvider', () => {
  let provider: SmtpProvider;
  const mockSendMail = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'smtp.test.com';
    process.env.SMTP_PORT = '587';
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
      verify: jest.fn().mockResolvedValue(true),
    });
    provider = new SmtpProvider();
  });

  it('sends email successfully', async () => {
    await provider.onModuleInit();
    mockSendMail.mockResolvedValueOnce({ messageId: 'msg-smtp-123' });

    const result = await provider.send({
      to: 'recipient@test.com',
      from: 'sender@test.com',
      subject: 'Hello',
      html: '<p>Hi</p>',
      text: 'Hi',
    });

    expect(result).toEqual({
      messageId: 'msg-smtp-123',
      provider: 'smtp',
      simulated: false,
    });
  });

  describe('error classification', () => {
    it('classifies EAUTH as permanent EmailSendError', async () => {
      await provider.onModuleInit();
      const err = new Error('Auth failed');
      (err as any).code = 'EAUTH';
      mockSendMail.mockRejectedValueOnce(err);

      await expect(
        provider.send({
          to: 'recipient@test.com',
          from: 'sender@test.com',
          subject: 'Hello',
          html: '<p>Hi</p>',
          text: 'Hi',
        }),
      ).rejects.toMatchObject({
        permanent: true,
      });
    });

    it('classifies 5xx response code as permanent', async () => {
      await provider.onModuleInit();
      const err = new Error('Mailbox not found');
      (err as any).responseCode = 550;
      mockSendMail.mockRejectedValueOnce(err);

      await expect(
        provider.send({
          to: 'recipient@test.com',
          from: 'sender@test.com',
          subject: 'Hello',
          html: '<p>Hi</p>',
          text: 'Hi',
        }),
      ).rejects.toMatchObject({
        permanent: true,
      });
    });

    it('classifies 4xx response code as transient', async () => {
      await provider.onModuleInit();
      const err = new Error('Mailbox busy');
      (err as any).responseCode = 421;
      mockSendMail.mockRejectedValueOnce(err);

      await expect(
        provider.send({
          to: 'recipient@test.com',
          from: 'sender@test.com',
          subject: 'Hello',
          html: '<p>Hi</p>',
          text: 'Hi',
        }),
      ).rejects.toMatchObject({
        permanent: false,
      });
    });

    it('classifies ETIMEDOUT / ECONNECTION as transient', async () => {
      await provider.onModuleInit();
      const err = new Error('Connection timeout');
      (err as any).code = 'ETIMEDOUT';
      mockSendMail.mockRejectedValueOnce(err);

      await expect(
        provider.send({
          to: 'recipient@test.com',
          from: 'sender@test.com',
          subject: 'Hello',
          html: '<p>Hi</p>',
          text: 'Hi',
        }),
      ).rejects.toMatchObject({
        permanent: false,
      });
    });
  });
});
