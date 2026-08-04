import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { JourneySection, JourneyStage } from '../../models/journey.models';

interface IndexedSection {
  readonly index: number;
  readonly section: JourneySection;
}

@Component({
  selector: 'app-journey-sidebar',
  templateUrl: './journey-sidebar.html',
  styleUrl: './journey-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JourneySidebar {
  readonly sections = input.required<readonly JourneySection[]>();
  readonly activeSectionIndex = input.required<number>();
  readonly activeStage = input.required<JourneyStage>();
  readonly completedSectionIds = input.required<ReadonlySet<string>>();
  readonly highestReachableIndex = input.required<number>();

  readonly sectionSelected = output<number>();

  protected readonly applicationSections = computed<readonly IndexedSection[]>(() =>
    this.sections()
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => section.stage === 'application'),
  );

  protected readonly yourDetailsSection = computed<IndexedSection | null>(() => {
    const index = this.sections().findIndex((section) => section.stage === 'your-details');
    return index >= 0 ? { index, section: this.sections()[index]! } : null;
  });

  protected readonly applicationComplete = computed(() => {
    const applicationSections = this.applicationSections();
    return (
      applicationSections.length > 0 &&
      applicationSections.every(({ section }) => this.completedSectionIds().has(section.id))
    );
  });

  protected isSectionActive(index: number): boolean {
    return this.activeStage() !== 'quote' && this.activeSectionIndex() === index;
  }

  protected canNavigateTo(index: number): boolean {
    return index <= this.highestReachableIndex();
  }

  protected selectSection(index: number): void {
    if (this.canNavigateTo(index)) {
      this.sectionSelected.emit(index);
    }
  }
}
