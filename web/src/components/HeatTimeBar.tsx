// The Heat view's time bar, along the bottom of the map: a row of days and a
// row of hours (8 AM to 5 PM, Philippine time). Pressing one picks that forecast time.
// An hour the chosen source has no value for is greyed out. Display only.

import { BAR_HOURS, barDays, barTime, phDate } from '@ph-monitor/shared';
import { dayLabel, hourLabel, pickDay } from '../heatTime.ts';
import { useStrings } from '../i18n/index.ts';

type Props = {
  /** The chosen time (ISO). */
  chosen: string;
  /** The times the chosen source has (ISO), or null while that is not known. */
  hours: string[] | null;
  /** The clock, passed in so the bar never reads it. */
  now: Date;
  /** Called with the ISO time that was pressed. */
  onChoose: (iso: string) => void;
};

export function HeatTimeBar({ chosen, hours, now, onChoose }: Props) {
  const { t } = useStrings();
  const days = barDays(now);
  // The PH date and hour of the chosen time, to mark the pressed buttons.
  const chosenDate = new Date(chosen);
  const chosenDay = phDate(chosenDate);
  return (
    <nav className="heat-time" aria-label={t.heat.timeBar}>
      <div className="heat-time-row">
        {days.map((day, i) => (
          <button
            key={day}
            type="button"
            className="filter"
            aria-pressed={day === chosenDay}
            onClick={() => onChoose(pickDay(day, chosen, hours))}
          >
            {i === 0 ? `${t.heat.today} ` : ''}
            {dayLabel(day, t)}
          </button>
        ))}
      </div>
      <div className="heat-time-row">
        {BAR_HOURS.map((hour) => {
          const iso = barTime(chosenDay, hour).toISOString();
          return (
            <button
              key={hour}
              type="button"
              className="filter"
              aria-pressed={iso === chosen}
              disabled={hours !== null && !hours.includes(iso)}
              title={hours !== null && !hours.includes(iso) ? t.heat.noHour : undefined}
              onClick={() => onChoose(iso)}
            >
              {hourLabel(hour, t)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
