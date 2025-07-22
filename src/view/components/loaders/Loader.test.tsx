import { render } from '@testing-library/react';
import Loader from './Loader';

describe('Loader', () => {
  it('renders loader element with correct class', () => {
    const { container } = render(<Loader />);
    const loader = container.querySelector('.loader');
    expect(loader).toBeInTheDocument();
    expect(loader).toHaveClass('loader');
  });

  it('renders as a span element', () => {
    const { container } = render(<Loader />);
    const span = container.querySelector('span');
    expect(span).toBeInTheDocument();
    expect(span).toHaveClass('loader');
  });
});