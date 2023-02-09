import { ChangeDetectionStrategy, Component, Injector, OnInit } from '@angular/core';
import {
  DataForFrontendHome, DataForUserPasswords, FrontendContentLayoutEnum,
  FrontendDashboardAccount, FrontendQuickAccessTypeEnum, PasswordStatusAndActions, PasswordStatusEnum, RoleEnum, UserMenuEnum
} from 'app/api/models';
import { FrontendService } from 'app/api/services/frontend.service';
import { SvgIcon } from 'app/core/svg-icon';
import { ApiHelper } from 'app/shared/api-helper';
import { empty } from 'app/shared/helper';
import { QuickAccessAction } from 'app/ui/dashboard/quick-access-action';
import { BasePageComponent, UpdateTitleFrom } from 'app/ui/shared/base-page.component';
import { ActiveMenu, Menu } from 'app/ui/shared/menu';
import { environment } from 'environments/environment';
import { chunk } from 'lodash-es';

export const PasswordStatusNeedingAttention = [
  PasswordStatusEnum.EXPIRED, PasswordStatusEnum.RESET,
  PasswordStatusEnum.PENDING, PasswordStatusEnum.NEVER_CREATED,
];

/**
 * Displays the dashboard page (home for logged users)
 */
@Component({
  // tslint:disable-next-line:component-selector
  selector: 'dashboard',
  templateUrl: 'dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent extends BasePageComponent<DataForFrontendHome> implements OnInit {

  FrontendContentLayoutEnum = FrontendContentLayoutEnum;

  passwords: DataForUserPasswords;
  passwordsNeedingAttention: PasswordStatusAndActions[];
  pendingSecurityAnswer = false;

  actions: QuickAccessAction[];
  accounts: FrontendDashboardAccount[][];

  constructor(
    injector: Injector,
    private frontendService: FrontendService) {
    super(injector);
  }

  ngOnInit() {
    super.ngOnInit();
    if (this.login.user == null) {
      // Not logged in. Navigate to the guest home page
      this.router.navigate(['/home'], { replaceUrl: true });
      return;
    }

    this.addSub(this.frontendService.dataForFrontendHome({
      screenSize: this.layout.screenSize
    }).subscribe(data => this.data = data));
  }

  onDataInitialized(data: DataForFrontendHome) {
    if (data.accounts) {
      const parts = chunk(data.accounts, data.mergeAccounts ? 4 : 1);
      if (data.mergeAccounts && parts.length > 1) {
        // Make sure the last card doesn't have a single account, while others are full
        const last = parts[parts.length - 1];
        const previous = parts[parts.length - 2];
        if (last.length === 1) {
          const removed = previous.splice(previous.length - 1, 1);
          Array.prototype.unshift.apply(last, removed);
        }
      }
      this.accounts = parts;
    }
    this.initDashboardActions(data);
  }

  updateTitleFrom(): UpdateTitleFrom {
    return 'menu';
  }

  passwordMessage(ps: PasswordStatusAndActions) {
    const type = ps.type.name;
    switch (ps.status) {
      case PasswordStatusEnum.EXPIRED:
        return this.i18n.dashboard.passwords.expired(type);
      case PasswordStatusEnum.RESET:
        return this.i18n.dashboard.passwords.reset(type);
      case PasswordStatusEnum.PENDING:
        return this.i18n.dashboard.passwords.pending(type);
      case PasswordStatusEnum.NEVER_CREATED:
        return this.i18n.dashboard.passwords.neverCreated(type);
    }
  }

  goToPasswords(event: MouseEvent) {
    this.menu.navigate({
      menu: new ActiveMenu(Menu.PASSWORDS),
      event,
      clear: false,
    });
  }

  resolveMenu() {
    return Menu.DASHBOARD;
  }

  initDashboardActions(data: DataForFrontendHome) {
    this.actions = [];
    const auth = this.dataForFrontendHolder.auth;
    const permissions = auth.permissions || {};

    const types = new Set(data.quickAccess);

    const addAction = (
      icon: SvgIcon, label: string, activeMenu: ActiveMenu, onClick?: () => void, url?: string): void => {
      const entry = this.menu.menuEntry(activeMenu);
      if (entry) {
        this.actions.push({
          icon,
          label,
          entry,
          onClick,
          url
        });
      }
    };

    const owner = this.dataForFrontendHolder.role === RoleEnum.ADMINISTRATOR
      ? ApiHelper.SYSTEM : ApiHelper.SELF;

    // PAYMENTS
    if (permissions.banking) {
      if (types.has(FrontendQuickAccessTypeEnum.ACCOUNT)) {
        // Skip the quick access icon for accounts already visible in the dashboard
        const allAccounts = (permissions.banking.accounts || []);
        const accounts = allAccounts.filter(p => this.layout.ltmd || p.visible && !p.viewStatus).map(p => p.account);
        if (accounts.length >= ApiHelper.MIN_ACCOUNTS_FOR_SUMMARY) {
          addAction(SvgIcon.Wallet2, this.i18n.dashboard.action.accounts, new ActiveMenu(Menu.ACCOUNTS_SUMMARY));
        } else {
          for (const account of accounts) {
            const accountType = account.type;
            const accountLabel = allAccounts.length === 1 ? this.i18n.dashboard.action.account : accountType.name;
            addAction(SvgIcon.Wallet2, accountLabel, new ActiveMenu(Menu.ACCOUNT_HISTORY, { accountType }));
          }
        }
      }
      const payments = permissions.banking.payments || {};
      if (types.has(FrontendQuickAccessTypeEnum.PAY_USER) && payments.user) {
        addAction(SvgIcon.Wallet2ArrowRight, this.i18n.dashboard.action.payUser, new ActiveMenu(Menu.PAYMENT_TO_USER));
      }
      if (types.has(FrontendQuickAccessTypeEnum.PAY_SYSTEM) && payments.system) {
        addAction(SvgIcon.Wallet2ArrowRight, this.i18n.dashboard.action.paySystem, new ActiveMenu(Menu.PAYMENT_TO_SYSTEM));
      }
      if (types.has(FrontendQuickAccessTypeEnum.POS) && payments.pos) {
        addAction(SvgIcon.CreditCard, this.i18n.dashboard.action.pos, new ActiveMenu(Menu.POS));
      }
      const tickets = permissions.banking.tickets || {};
      if (types.has(FrontendQuickAccessTypeEnum.RECEIVE_QR_PAYMENT) && tickets.create) {
        addAction(SvgIcon.QrCodeScan, this.i18n.dashboard.action.receiveQrPayment, new ActiveMenu(Menu.RECEIVE_QR_PAYMENT));
      }

      const scheduledPayments = permissions.banking.scheduledPayments || {};
      if (types.has(FrontendQuickAccessTypeEnum.SCHEDULED_PAYMENTS) && scheduledPayments?.view) {
        addAction(SvgIcon.CalendarEvent, this.i18n.dashboard.action.scheduledPayments, new ActiveMenu(Menu.SCHEDULED_PAYMENTS));
      }

      // PAYMENT REQUESTS
      const paymentRequests = permissions.banking.paymentRequests || {};
      const paymentRequestsMenu = new ActiveMenu(Menu.PAYMENT_REQUESTS);
      if (types.has(FrontendQuickAccessTypeEnum.REQUEST_PAYMENT_FROM_USER) && paymentRequests?.sendToUser) {
        addAction(SvgIcon.Wallet2ArrowLeft, this.i18n.dashboard.action.sendPaymentRequestToUser, paymentRequestsMenu, null,
          `/banking/${owner}/payment-request`);
      }
      if (types.has(FrontendQuickAccessTypeEnum.REQUEST_PAYMENT_FROM_SYSTEM) && paymentRequests?.sendToSystem) {
        addAction(SvgIcon.Wallet2ArrowLeft, this.i18n.dashboard.action.sendPaymentRequestToSystem, paymentRequestsMenu, null,
          `/banking/${owner}/payment-request/${ApiHelper.SYSTEM}`);
      }
      if (types.has(FrontendQuickAccessTypeEnum.PAYMENT_REQUESTS) && paymentRequests?.view) {
        addAction(SvgIcon.Wallet2ArrowLeft, this.i18n.dashboard.action.paymentRequests, paymentRequestsMenu);
      }

      const externalPayments = permissions.banking.externalPayments || {};
      if (types.has(FrontendQuickAccessTypeEnum.PAY_EXTERNAL_USER) && externalPayments?.perform) {
        addAction(SvgIcon.Wallet2ArrowUpRight, this.i18n.dashboard.action.payExternalUser, new ActiveMenu(Menu.EXTERNAL_PAYMENTS), null,
          `/banking/${ApiHelper.SELF}/external-payment`);
      }
    }

    // VOUCHERS
    const vouchers = this.menu.resolveVoucherPermissions(permissions.vouchers || {});
    const myVoucherMenu = new ActiveMenu(this.dataForFrontendHolder.dataForFrontend.voucherBuyingMenu == UserMenuEnum.MARKETPLACE ?
      Menu.SEARCH_MY_VOUCHERS_MARKETPLACE : Menu.SEARCH_MY_VOUCHERS_BANKING);
    if (types.has(FrontendQuickAccessTypeEnum.VOUCHERS) && vouchers?.viewVouchers) {
      addAction(SvgIcon.Ticket, this.i18n.dashboard.action.vouchers, myVoucherMenu);
    }
    if (types.has(FrontendQuickAccessTypeEnum.BUY_VOUCHER) && vouchers.buy) {
      addAction(SvgIcon.Ticket, this.i18n.dashboard.action.buy, myVoucherMenu, null, `/banking/${ApiHelper.SELF}/vouchers/buy`);
    }
    if (types.has(FrontendQuickAccessTypeEnum.SEND_VOUCHER) && vouchers.send) {
      addAction(SvgIcon.Ticket, this.i18n.dashboard.action.send, myVoucherMenu, null, `/banking/${ApiHelper.SELF}/vouchers/send`);
    }
    const voucherTransactionsMenu = new ActiveMenu(Menu.VOUCHER_TRANSACTIONS);
    if (types.has(FrontendQuickAccessTypeEnum.VOUCHER_TRANSACTIONS) && vouchers?.viewTransactions) {
      const voucherTransactionsLabel = this.dataForFrontendHolder.dataForFrontend.topUpEnabled ?
        this.i18n.dashboard.action.voucherTransactions : this.i18n.dashboard.action.voucherTransactionsRedeems;
      addAction(SvgIcon.TicketDetailed, voucherTransactionsLabel, voucherTransactionsMenu);
    }
    if (types.has(FrontendQuickAccessTypeEnum.REDEEM_VOUCHER) && vouchers?.redeem) {
      addAction(SvgIcon.TicketArrowDown, this.i18n.dashboard.action.redeem, voucherTransactionsMenu, null, `/banking/${ApiHelper.SELF}/vouchers/redeem`);
    }
    if (types.has(FrontendQuickAccessTypeEnum.TOP_UP_VOUCHER) && vouchers?.topUp) {
      addAction(SvgIcon.TicketArrowUp, this.i18n.dashboard.action.topUp, voucherTransactionsMenu, null, `/banking/${ApiHelper.SELF}/vouchers/top-up`);
    }

    // USERS
    if (types.has(FrontendQuickAccessTypeEnum.CONTACTS) && (permissions.contacts || {}).enable) {
      addAction(SvgIcon.Book, this.i18n.dashboard.action.contacts, new ActiveMenu(Menu.CONTACTS));
    }
    const users = permissions.users || {};
    if (types.has(FrontendQuickAccessTypeEnum.SEARCH_USERS) && !data.showLatestUsers && (users.search || users.map)) {
      addAction(SvgIcon.People, this.i18n.dashboard.action.directory, new ActiveMenu(Menu.SEARCH_USERS));
    }

    // MARKETPLACE
    const marketplace = permissions.marketplace || {};
    if (types.has(FrontendQuickAccessTypeEnum.SEARCH_ADS) && !data.showLatestAds
      && ((marketplace.userSimple || {}).view || (marketplace.userWebshop || {}).view)) {
      addAction(SvgIcon.Basket, this.i18n.dashboard.action.advertisements, new ActiveMenu(Menu.SEARCH_ADS));
    }

    // PROFILE
    if (types.has(FrontendQuickAccessTypeEnum.EDIT_PROFILE) && (permissions.myProfile || {}).editProfile) {
      addAction(SvgIcon.Person, this.i18n.dashboard.action.editProfile, new ActiveMenu(Menu.EDIT_MY_PROFILE));
    }
    if (types.has(FrontendQuickAccessTypeEnum.PASSWORDS) && !empty((permissions.passwords || {}).passwords)) {
      const passwordsLabel = permissions.passwords.passwords.length === 1 ? this.i18n.dashboard.action.password :
        this.i18n.dashboard.action.passwords;
      addAction(SvgIcon.Key, passwordsLabel, new ActiveMenu(Menu.PASSWORDS));
    }

    // SETTINGS
    if (types.has(FrontendQuickAccessTypeEnum.SWITCH_THEME)) {
      addAction(SvgIcon.LightDark, this.i18n.dashboard.action.switchTheme, new ActiveMenu(Menu.SETTINGS),
        () => this.layout.darkTheme = !this.layout.darkTheme);
    }
    if (types.has(FrontendQuickAccessTypeEnum.USE_CLASSIC_FRONTEND) && !environment.standalone
      && this.dataForFrontendHolder.dataForFrontend.allowFrontendSwitching) {
      addAction(SvgIcon.Display, this.i18n.dashboard.action.classicFrontend, new ActiveMenu(Menu.SETTINGS),
        () => this.dataForFrontendHolder.useClassicFrontend(true));
    }
    if (types.has(FrontendQuickAccessTypeEnum.SETTINGS)) {
      addAction(SvgIcon.Gear, this.i18n.dashboard.action.settings, new ActiveMenu(Menu.SETTINGS));
    }
  }
}
