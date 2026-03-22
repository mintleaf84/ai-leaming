import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../tabs'

describe('Tabs Component', () => {
    it('renders tabs correctly and switches content on click', () => {
        render(
            <Tabs defaultValue="tab1">
                <TabsList>
                    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
                    <TabsTrigger value="tab2">Tab 2</TabsTrigger>
                </TabsList>
                <TabsContent value="tab1">Content 1</TabsContent>
                <TabsContent value="tab2">Content 2</TabsContent>
            </Tabs>
        )

        // Initial state
        expect(screen.getByText('Content 1')).toHaveAttribute('data-state', 'active')
        
        // Click Tab 2
        fireEvent.click(screen.getByText('Tab 2'))
        
        expect(screen.getByText('Content 2')).toHaveAttribute('data-state', 'active')
    })
})
