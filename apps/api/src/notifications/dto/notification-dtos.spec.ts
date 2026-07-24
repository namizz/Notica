import 'reflect-metadata';
import { ChannelType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListNotificationsDto } from './list-notifications.dto';
import { SendNotificationDto } from './send-notification.dto';

describe('notification DTO validation', () => {
  it('rejects unsupported channels and oversized notification content', async () => {
    const dto = plainToInstance(SendNotificationDto, {
      recipientId: 'customer-1',
      title: 'x'.repeat(161),
      body: 'Message',
      channel: 'SMS',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['title', 'channel']),
    );
  });

  it('transforms bounded pagination and accepts valid filters', async () => {
    const dto = plainToInstance(ListNotificationsDto, {
      page: '2',
      limit: '25',
      channel: ChannelType.IN_APP,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(25);
  });

  it('rejects invalid pagination values', async () => {
    const dto = plainToInstance(ListNotificationsDto, {
      page: '0',
      limit: '101',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['page', 'limit']),
    );
  });
});
