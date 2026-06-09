import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PushProvider } from './push-provider.interface';

@Injectable()
export class WebPushProvider implements PushProvider, OnModuleInit {
  private readonly logger = new Logger(WebPushProvider.name);

  onModuleInit() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:dev@notica.com';

    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID public or private key is missing. Web Push notifications will fail.');
      return;
    }

    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.logger.log('VAPID details configured successfully for Web Push.');
    } catch (e: any) {
      this.logger.error(`Failed to set VAPID details: ${e.message}`);
    }
  }

  async send(subscriptionJson: string, payload: any): Promise<any> {
    try {
      const subscription = JSON.parse(subscriptionJson);
      const payloadString = JSON.stringify(payload);
      const response = await webpush.sendNotification(subscription, payloadString);
      this.logger.log(`Web Push sent successfully via WebPushProvider: ${response.statusCode}`);
      return response;
    } catch (e: any) {
      this.logger.error(`Error sending Web Push notification: ${e.message}`);
      throw e;
    }
  }
}
