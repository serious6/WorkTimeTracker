import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { Checkbox, Field, Input } from './input'

describe('Field', () => {
  test('links the label to the control via a generated id', () => {
    render(
      <Field label="Project">
        <Input name="projectId" />
      </Field>,
    )
    expect(screen.getByLabelText('Project')).toBeInTheDocument()
  })

  test('respects an explicit id on the control instead of generating one', () => {
    render(
      <Field label="Project">
        <Input id="explicit-id" name="projectId" />
      </Field>,
    )
    const input = screen.getByLabelText('Project')
    expect(input).toHaveAttribute('id', 'explicit-id')
  })

  test('links a hint through aria-describedby when there is no error', () => {
    render(
      <Field hint="Accepts 2h 45m or 90m" label="Duration">
        <Input name="duration" />
      </Field>,
    )
    const input = screen.getByLabelText('Duration')
    const hint = screen.getByText('Accepts 2h 45m or 90m')
    expect(input).toHaveAttribute('aria-describedby', hint.id)
  })

  test('marks an errored field aria-invalid and describes it by the error message', () => {
    render(
      <Field error="Enter a duration such as 2h 45m, 90m or 1.5h" label="Duration">
        <Input name="duration" />
      </Field>,
    )
    const input = screen.getByLabelText('Duration')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const message = screen.getByText('Enter a duration such as 2h 45m, 90m or 1.5h')
    expect(input).toHaveAttribute('aria-describedby', message.id)
  })

  test('announces the error message via role=alert', () => {
    render(
      <Field error="Date is required" label="Date">
        <Input name="date" />
      </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Date is required')
  })

  test('preserves accessibility metadata supplied by the control', () => {
    render(
      <>
        <p id="existing-description">Existing description</p>
        <Field error="Date is required" label="Date">
          <Input aria-describedby="existing-description" aria-invalid="grammar" name="date" />
        </Field>
        <Field label="Project">
          <Input aria-invalid="spelling" name="project" />
        </Field>
      </>,
    )
    const date = screen.getByLabelText('Date')
    const error = screen.getByText('Date is required')
    expect(date).toHaveAttribute('aria-describedby', `existing-description ${error.id}`)
    expect(date).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Project')).toHaveAttribute('aria-invalid', 'spelling')
  })

  test('does not dangle a hint id in aria-describedby when an error replaces the hint', () => {
    render(
      <Field error="Enter a duration such as 2h 45m, 90m or 1.5h" hint="Accepts 2h 45m or 90m" label="Duration">
        <Input name="duration" />
      </Field>,
    )
    const input = screen.getByLabelText('Duration')
    expect(screen.queryByText('Accepts 2h 45m or 90m')).not.toBeInTheDocument()
    const describedBy = input.getAttribute('aria-describedby') ?? ''
    for (const id of describedBy.split(' ').filter(Boolean)) {
      expect(document.getElementById(id)).not.toBeNull()
    }
  })
})

describe('Checkbox', () => {
  test('renders as a bare control without a label prop', () => {
    render(<Checkbox aria-label="Standalone" />)
    const checkbox = screen.getByRole('checkbox', { name: 'Standalone' })
    expect(checkbox.parentElement?.tagName).not.toBe('LABEL')
  })

  test('with a label, is found by getByLabelText and sits in a 40px hit area', () => {
    render(<Checkbox label="Monday" />)
    const checkbox = screen.getByLabelText('Monday')
    expect(checkbox).toBeInTheDocument()
    expect(checkbox.closest('label')).toHaveClass('min-h-10')
  })
})
