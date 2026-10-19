import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should show the AppRole entry under 系統管理 Admin', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.nav-group')?.textContent).toContain('系統管理 Admin');
    const link = el.querySelector('a.nav-item') as HTMLAnchorElement;
    expect(link.textContent).toContain('角色 AppRole');
    expect(link.getAttribute('href')).toBe('/app-roles');
  });

  it('should show the PublishStatus entry under 系統管理 Admin', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a.nav-item'));
    const link = links.find((a) => a.textContent?.includes('發布狀態 PublishStatus')) as HTMLAnchorElement;

    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/publish-statuses');
  });

  it('should collapse and expand a nav group', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    (el.querySelector('.nav-group') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('a.nav-item')).toBeNull();

    (el.querySelector('.nav-group') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('a.nav-item')).not.toBeNull();
  });
});
