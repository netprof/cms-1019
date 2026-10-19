import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly collapsed = signal(false);

  readonly navGroups: NavGroup[] = [
    {
      label: '系統管理 Admin',
      icon: 'pi-shield',
      items: [{ label: '角色 AppRole', icon: 'pi-id-card', route: '/app-roles' }],
    },
  ];

  readonly openGroups = signal<Set<string>>(new Set(this.navGroups.map((g) => g.label)));

  toggleGroup(label: string) {
    this.openGroups.update((open) => {
      const next = new Set(open);
      if (!next.delete(label)) next.add(label);
      return next;
    });
  }
}
