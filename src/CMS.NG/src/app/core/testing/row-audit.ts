import { Provider } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { RowAuditService } from '@app/shared/row-audit/row-audit.service';

/**
 * Stands in for the RowAuditService behind the 異動紀錄 History badge on detail and form pages:
 * every record has an empty history. Page specs add it to `providers`.
 */
export function provideRowAuditStub(): Provider {
  return {
    provide: RowAuditService,
    useFactory: () => {
      const stub = jasmine.createSpyObj<RowAuditService>('RowAuditService', ['getHistory', 'queryHistory']);
      stub.getHistory.and.returnValue(of([]));
      stub.queryHistory.and.returnValue(of([]));
      return stub;
    },
  };
}

/** The page shows the badge for this record (it fetched that record's history). */
export async function expectRowAuditBadge(fixture: ComponentFixture<unknown>, tableName: string, pkid: string | number) {
  fixture.detectChanges();
  await fixture.whenStable();
  const service = TestBed.inject(RowAuditService) as jasmine.SpyObj<RowAuditService>;
  expect((fixture.nativeElement as HTMLElement).querySelector('#row-audit-button')).not.toBeNull();
  expect(service.getHistory).toHaveBeenCalledWith(tableName, pkid);
}

/** The page shows no badge, e.g. a New form with no record yet. */
export async function expectNoRowAuditBadge(fixture: ComponentFixture<unknown>) {
  fixture.detectChanges();
  await fixture.whenStable();
  const service = TestBed.inject(RowAuditService) as jasmine.SpyObj<RowAuditService>;
  expect((fixture.nativeElement as HTMLElement).querySelector('#row-audit-button')).toBeNull();
  expect(service.getHistory).not.toHaveBeenCalled();
}
