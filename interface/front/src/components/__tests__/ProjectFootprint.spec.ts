import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ProjectFootprint from '../ProjectFootprint.vue'
import { api } from '@/services/api'
import { accessibilityViolations } from '@/__tests__/accessibility'

const mountComponent = () =>
  mount(ProjectFootprint, { props: { project: 'proprio/poc' }, global: { stubs: { RouterLink: RouterLinkStub } }, attachTo: document.body })

describe('Footprint of a project', () => {
  afterEach(() => vi.restoreAllMocks())

  it('displays the project total, its equivalent and the number of requests', async () => {
    const read = vi.spyOn(api, 'read').mockResolvedValue({
      footprint: { co2Grams: { min: 64, max: 64 }, energyWh: { min: 1, max: 1 }, outputTokenCount: 1, inputTokenCount: 1 },
      workRequests: 3,
      equivalents: { streamingHourGrams: 64 },
    })
    const vue = mountComponent()
    await flushPromises()
    expect(read).toHaveBeenCalledWith('/projects/proprio%2Fpoc/footprint')
    const text = vue.get('[data-testid="project-footprint"]').text()
    expect(text).toContain('64 g CO2e')
    expect(text).toContain('1 h de streaming vidéo')
    expect(text).toContain('3 demandes')
    expect(await accessibilityViolations(vue.element)).toEqual([])
    vue.unmount()
  })

  it('displays nothing until ADA has worked on the project, nor in case of error', async () => {
    vi.spyOn(api, 'read').mockResolvedValueOnce(null)
    const empty = mountComponent()
    await flushPromises()
    expect(empty.find('[data-testid="project-footprint"]').exists()).toBe(false)
    empty.unmount()
    vi.spyOn(api, 'read').mockRejectedValueOnce(new Error('hors ligne'))
    const error = mountComponent()
    await flushPromises()
    expect(error.find('[data-testid="project-footprint"]').exists()).toBe(false)
    error.unmount()
  })
})
