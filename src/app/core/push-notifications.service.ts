import { Injectable, NgZone } from '@angular/core';
import { ApiConfiguration } from 'app/api/api-configuration';
import {
  DeviceConfirmationView, IdentityProviderCallbackResult, NewMessagePush, NewNotificationPush,
  PushNotificationEventKind, TransactionView
} from 'app/api/models';
import { NextRequestState } from 'app/core/next-request-state';
import { empty, urlJoin } from 'app/shared/helper';
import { EventSourcePolyfill } from 'ng-event-source';
import { Subject } from 'rxjs';

export const Kinds: PushNotificationEventKind[] = [
  PushNotificationEventKind.LOGGED_OUT,
  PushNotificationEventKind.PERMISSIONS_CHANGED,
  PushNotificationEventKind.NEW_NOTIFICATION,
  PushNotificationEventKind.DEVICE_CONFIRMATION,
  PushNotificationEventKind.IDENTITY_PROVIDER_CALLBACK,
  PushNotificationEventKind.TICKET,
  PushNotificationEventKind.NEW_MESSAGE,
];
export const ClientId = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

/**
 * Handles the registration and notitification of push events
 */
@Injectable({
  providedIn: 'root',
})
export class PushNotificationsService {

  private eventSource: EventSourcePolyfill;

  public loggedOut$ = new Subject<void>();
  public permissionsChanged$ = new Subject<void>();
  public newNotifications$ = new Subject<NewNotificationPush>();
  public newMessages$ = new Subject<NewMessagePush>();
  public deviceConfirmations$ = new Subject<DeviceConfirmationView>();
  public identityProviderCallback$ = new Subject<IdentityProviderCallbackResult>();
  public ticket$ = new Subject<TransactionView>();

  constructor(
    private apiConfiguration: ApiConfiguration,
    private zone: NgZone,
    private nextRequestState: NextRequestState,
  ) {
  }

  /**
   * Opens the stream. Must be called when there's a logged user
   */
  open() {
    if (this.eventSource) {
      // Already opened
      return;
    }
    const kinds = new Set<string>(Kinds);
    let url = urlJoin(this.apiConfiguration.rootUrl, 'push', 'subscribe') + '?clientId=' + ClientId;
    kinds.forEach(kind => url += '&kinds=' + kind);
    this.eventSource = new EventSourcePolyfill(url, {
      headers: this.nextRequestState.headers,
    });

    // Setup the listeners
    this.setupListener(PushNotificationEventKind.LOGGED_OUT, this.loggedOut$);
    this.setupListener(PushNotificationEventKind.PERMISSIONS_CHANGED, this.permissionsChanged$);
    this.setupListener(PushNotificationEventKind.NEW_NOTIFICATION, this.newNotifications$);
    this.setupListener(PushNotificationEventKind.NEW_MESSAGE, this.newMessages$);
    this.setupListener(PushNotificationEventKind.DEVICE_CONFIRMATION, this.deviceConfirmations$);
    this.setupListener(PushNotificationEventKind.IDENTITY_PROVIDER_CALLBACK, this.identityProviderCallback$);
    this.setupListener(PushNotificationEventKind.TICKET, this.ticket$);
  }

  /**
   * Opens the stream. Must be called when there's a logged user
   */
  openForIdentityProviderCallback(requestId: string) {
    if (this.eventSource) {
      // Already opened
      return;
    }
    const url = urlJoin(this.apiConfiguration.rootUrl, 'push', 'subscribe')
      + `?clientId=${ClientId}&kinds=`
      + PushNotificationEventKind.IDENTITY_PROVIDER_CALLBACK
      + `&identityProviderRequestId=${requestId}`;
    this.eventSource = new EventSourcePolyfill(url, {
      headers: this.nextRequestState.headers,
    });
    this.setupListener(PushNotificationEventKind.IDENTITY_PROVIDER_CALLBACK, this.identityProviderCallback$);
  }

  /**
   * Closes the stream
   */
  close() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private setupListener(kind: PushNotificationEventKind, subject: Subject<any>) {
    this.eventSource.addEventListener(kind, (event: any) => {
      this.zone.run(() => {
        const data = empty(event.data) ? null : JSON.parse(event.data);
        if (kind === PushNotificationEventKind.LOGGED_OUT) {
          // Close the EventSource immediately after being logged out
          this.close();
        }
        subject.next(data);
      });
    });
  }
}
