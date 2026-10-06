import { ComposerRadioMenu } from "./ComposerRadioMenu";
import { RESEARCH_DATABASES, type ResearchDatabaseOption } from "./constants";

type ResearchDatabaseMenuProps = {
  value: ResearchDatabaseOption;
  onChange: (value: ResearchDatabaseOption) => void;
  disabled?: boolean;
};

export function ResearchDatabaseMenu({ value, onChange, disabled }: ResearchDatabaseMenuProps) {
  return (
    <ComposerRadioMenu
      heading="Research databases"
      options={RESEARCH_DATABASES}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
