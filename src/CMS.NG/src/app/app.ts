import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { SERVER_ERROR_TOAST_KEY } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

interface NavGroup {
  label: string;
  icon: string;
  /** Shown only when the token's roles include "Admin". */
  adminOnly?: boolean;
  items: NavItem[];
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly auth = inject(AuthService);
  readonly serverErrorToastKey = SERVER_ERROR_TOAST_KEY;
  readonly collapsed = signal(false);

  readonly navGroups: NavGroup[] = [
    {
      label: '系統管理 Admin',
      icon: 'pi-shield',
      adminOnly: true,
      items: [
        { label: '使用者 AppUser', icon: 'pi-user', route: '/app-users' },
        { label: '角色 AppRole', icon: 'pi-id-card', route: '/app-roles' },
        { label: '發布狀態 PublishStatus', icon: 'pi-flag', route: '/publish-statuses' },
        { label: '模型價格 ModelPrice', icon: 'pi-dollar', route: '/model-prices' },
        { label: '用量報表 TokenUsage', icon: 'pi-chart-bar', route: '/token-usages' },
      ],
    },
    {
      label: '課程管理 Course',
      icon: 'pi-book',
      items: [
        { label: '合作廠商 Partner', icon: 'pi-building', route: '/partners' },
        { label: '課程群組 CourseGroup', icon: 'pi-sitemap', route: '/course-groups' },
        { label: '課程 Course', icon: 'pi-book', route: '/courses' },
      ],
    },
    {
      label: '首頁 Home',
      icon: 'pi-home',
      items: [
        { label: '上稿作業 FeaturedPromoItem', icon: 'pi-megaphone', route: '/featured-promo-items' },
      ],
    },
  ];

  readonly visibleNavGroups = computed(() =>
    this.navGroups.filter((g) => !g.adminOnly || this.auth.isAdmin()),
  );

  readonly openGroups = signal<Set<string>>(new Set(this.navGroups.map((g) => g.label)));

  toggleGroup(label: string) {
    this.openGroups.update((open) => {
      const next = new Set(open);
      if (!next.delete(label)) next.add(label);
      return next;
    });
  }
}
