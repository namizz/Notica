import { Injectable, Logger } from '@nestjs/common';
import { WebPushProvider } from './web-push.provider';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly webPushProvider: WebPushProvider) {}

  async sendPushNotification(subscriptionJson: string, payload: any): Promise<any> {
    // Delegates to WebPushProvider. We can add routing logic here in future (e.g., FCM vs WebPush).
    return this.webPushProvider.send(subscriptionJson, payload);
  }
}
