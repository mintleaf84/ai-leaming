import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '../dialog'

describe('Dialog Component', () => {
    it('opens dialog when trigger is clicked', async () => {
        render(
            <Dialog>
                <DialogTrigger>Open Dialog</DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Dialog Title</DialogTitle>
                        <DialogDescription>Dialog Description</DialogDescription>
                    </DialogHeader>
                    <div>Inside Dialog</div>
                </DialogContent>
            </Dialog>
        )

        // Initial state: dialog content should not be visible
        expect(screen.queryByText('Dialog Title')).not.toBeInTheDocument()

        // Click trigger
        fireEvent.click(screen.getByText('Open Dialog'))

        // Dialog content is rendered async because of portal/animation
        await waitFor(() => {
            expect(screen.getByText('Dialog Title')).toBeInTheDocument()
            expect(screen.getByText('Dialog Description')).toBeInTheDocument()
            expect(screen.getByText('Inside Dialog')).toBeInTheDocument()
        })
    })
})
