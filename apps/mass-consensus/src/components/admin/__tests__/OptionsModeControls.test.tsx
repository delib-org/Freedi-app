/**
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from '@testing-library/react';
import OptionsModeControls, { OptionsMode } from '../QuestionOptionsBlock/OptionsModeControls';

jest.mock('@freedi/shared-i18n/next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    dir: 'ltr',
  }),
}));

const MASTER = 'Admin options only';
const ADMIN_ADDS = 'I add the options, with pictures';
const BLOCK = "Participants can't add options";

function renderControls(mode: OptionsMode) {
  const onChange = jest.fn();
  render(<OptionsModeControls mode={mode} onChange={onChange} />);

  return { onChange, master: screen.getByLabelText(MASTER), adminAdds: screen.getByLabelText(ADMIN_ADDS), block: screen.getByLabelText(BLOCK) };
}

describe('OptionsModeControls', () => {
  it('the master switch is on only when both switches are on', () => {
    expect(renderControls({ adminProvidesOptions: true, blockParticipantOptions: true }).master).toBeChecked();
  });

  it('a mixed state shows as master off with the two switches telling which is on', () => {
    const { master, adminAdds, block } = renderControls({ adminProvidesOptions: true, blockParticipantOptions: false });

    expect(master).not.toBeChecked();
    expect(adminAdds).toBeChecked();
    expect(block).not.toBeChecked();
  });

  it('turning the master on sets both switches', () => {
    const { onChange, master } = renderControls({ adminProvidesOptions: false, blockParticipantOptions: false });
    fireEvent.click(master);

    expect(onChange).toHaveBeenCalledWith({ adminProvidesOptions: true, blockParticipantOptions: true });
  });

  it('turning the master off clears both switches', () => {
    const { onChange, master } = renderControls({ adminProvidesOptions: true, blockParticipantOptions: true });
    fireEvent.click(master);

    expect(onChange).toHaveBeenCalledWith({ adminProvidesOptions: false, blockParticipantOptions: false });
  });

  it('each switch changes only its own field', () => {
    const { onChange, adminAdds, block } = renderControls({ adminProvidesOptions: false, blockParticipantOptions: false });

    fireEvent.click(adminAdds);
    expect(onChange).toHaveBeenLastCalledWith({ adminProvidesOptions: true, blockParticipantOptions: false });

    fireEvent.click(block);
    expect(onChange).toHaveBeenLastCalledWith({ adminProvidesOptions: false, blockParticipantOptions: true });
  });
});
